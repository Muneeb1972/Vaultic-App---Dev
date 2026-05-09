/**
 * Ika signature poller (Task 19.4, Req 12.4 / 28.2).
 *
 * Every 5 s sweeps the `Claim` table for rows that are
 * `status = 'Pending' AND ikaMessageHash IS NOT NULL` — i.e. the on-chain
 * program has already emitted `IkaSigningRequested` and we're waiting for
 * the Ika MPC network to commit a signature. For each pending row we
 * would normally:
 *
 *   1. Derive the `MessageApproval` PDA from the message hash.
 *   2. `getAccountInfo(pda)` against the Solana RPC.
 *   3. If the Borsh-decoded status flipped to `Signed`, extract the
 *      signature bytes, update `Claim { status: 'IkaApproved',
 *      ikaSignature }`, broadcast an `IkaApproved` SSE event.
 *
 * **Phase 1.5 gap.** We don't yet have the Ika program's account layout
 * (field order + `[u8; 64]` vs `[u8; 65]` signature width) pinned down
 * from upstream. Rather than hardcode guesses, this iteration:
 *
 *   • derives a *placeholder* PDA with a well-known seed so the log line
 *     is traceable;
 *   • logs `"would poll PDA X"` instead of actually decoding the account;
 *   • never flips any claim to `IkaApproved` (placeholder: "status is
 *     never Signed").
 *
 * When the Ika layout is finalised, swap the body of `pollOne` below —
 * the poll loop, rate control, SSE broadcast wiring, and claim lookup
 * are production-ready as-is.
 *
 * Lifecycle: the class does NOT auto-start. Call `start(hub)` once the
 * SSE hub is ready; call `stop()` in the graceful-shutdown hook.
 */
import { PublicKey } from '@solana/web3.js';

import type { AppConfig } from '../config';
import { prisma } from '../prisma';
import { logger } from '../utils/logger';
import type { SseHub } from './sse';

/** Minimum config required to derive the MessageApproval PDA. */
export type IkaPollerConfig = Pick<AppConfig, 'ikaProgramId'>;

/** Poll interval per design §3.2.6. */
export const IKA_POLL_INTERVAL_MS = 5_000;

/** Seed bytes used to derive the MessageApproval PDA — PLACEHOLDER. */
const MESSAGE_APPROVAL_SEED = Buffer.from('message_approval', 'utf8');

export interface IkaPollerOptions {
  /** Override the poll cadence — exposed for tests. */
  pollIntervalMs?: number;
}

export class IkaPoller {
  private readonly ikaProgramId: PublicKey;
  private readonly pollIntervalMs: number;

  /** Filled in by `start()` so tests can stub a different hub per run. */
  private hub: SseHub | null = null;
  private timer: NodeJS.Timeout | null = null;
  /** `true` while a `poll()` iteration is in flight — prevents overlap. */
  private polling = false;

  constructor(config: IkaPollerConfig, options: IkaPollerOptions = {}) {
    this.ikaProgramId = new PublicKey(config.ikaProgramId);
    this.pollIntervalMs = options.pollIntervalMs ?? IKA_POLL_INTERVAL_MS;
  }

  /**
   * Begin polling. Idempotent — a second `start()` is a no-op so the
   * caller can defensively invoke it from multiple bootstrap paths
   * (HTTP ready, DB ready) without double-scheduling.
   */
  start(hub: SseHub): void {
    if (this.timer !== null) return;
    this.hub = hub;
    this.timer = setInterval(() => {
      // Skip if the previous poll is still running — slow Prisma queries
      // or RPC timeouts shouldn't let two polls stomp on each other.
      if (this.polling) return;
      this.poll().catch((err) => {
        logger.error({ err }, 'IkaPoller.poll iteration failed');
      });
    }, this.pollIntervalMs);
    logger.info(
      { pollIntervalMs: this.pollIntervalMs },
      'IkaPoller started',
    );
  }

  /**
   * Stop polling and release the hub reference. Safe to call multiple
   * times and safe to call before `start()`.
   */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.hub = null;
  }

  /**
   * One sweep: fetch every pending claim with a known Ika message hash
   * and ask the Ika network whether a signature has landed yet. Exposed
   * as a protected method so tests can drive a single iteration without
   * touching the interval timer.
   */
  async poll(): Promise<void> {
    this.polling = true;
    try {
      const pending = await prisma.claim.findMany({
        where: {
          status: 'Pending',
          ikaMessageHash: { not: null },
        },
        select: {
          id: true,
          ikaMessageHash: true,
          onchainAddress: true,
          treasury: { select: { onchainAddress: true } },
        },
      });
      if (pending.length === 0) return;
      for (const claim of pending) {
        await this.pollOne(claim).catch((err) => {
          logger.error(
            { err, claimId: claim.id },
            'IkaPoller.pollOne failed — continuing with next claim',
          );
        });
      }
    } finally {
      this.polling = false;
    }
  }

  /**
   * Poll a single pending claim. See class-level comment for the Phase
   * 1.5 placeholder note.
   */
  private async pollOne(claim: {
    id: string;
    ikaMessageHash: string | null;
    onchainAddress: string;
    treasury: { onchainAddress: string };
  }): Promise<void> {
    if (claim.ikaMessageHash === null) return;

    // Placeholder PDA derivation — the real seeds depend on Ika's final
    // layout (likely `["message_approval", dwallet_pubkey, digest]`).
    // Using `[seed, hash]` here is deliberately simplified so callers
    // can grep the logs for a human-readable line.
    const hashBytes = Buffer.from(claim.ikaMessageHash, 'hex');
    const [pda] = PublicKey.findProgramAddressSync(
      [MESSAGE_APPROVAL_SEED, hashBytes],
      this.ikaProgramId,
    );

    logger.debug(
      {
        claimId: claim.id,
        claimAddress: claim.onchainAddress,
        messageApprovalPda: pda.toBase58(),
      },
      'IkaPoller: would poll MessageApproval PDA (Phase 1.5 placeholder)',
    );

    // PLACEHOLDER: we cannot decode the account without the Ika layout,
    // so we never flip the status. The production branch below is kept
    // here as a comment to make it obvious what the final shape looks
    // like:
    //
    //   const info = await connection.getAccountInfo(pda);
    //   if (!info) return;
    //   const decoded = decodeMessageApproval(info.data); // TODO: Phase 1.5
    //   if (decoded.status !== 'Signed') return;
    //   await this.promote(claim, decoded.signature);
  }

  /**
   * Production-path promotion of a pending claim once the Ika signature
   * lands. Not called from `pollOne` today — kept here so the bulk of
   * the wiring is ready for drop-in when Phase 1.5 is resolved. The
   * leading underscore marks it as intentionally unused; remove both the
   * prefix and the explanatory note below when wiring it up.
   */
  private async _promote(
    claim: {
      id: string;
      onchainAddress: string;
      treasury: { onchainAddress: string };
    },
    signatureBytes: Uint8Array,
  ): Promise<void> {
    const signatureHex = Buffer.from(signatureBytes).toString('hex');
    await prisma.claim.update({
      where: { id: claim.id },
      data: { status: 'IkaApproved', ikaSignature: signatureHex },
    });
    this.hub?.broadcast(claim.treasury.onchainAddress, {
      type: 'IkaApproved',
      data: {
        claim: claim.onchainAddress,
        ikaSignature: signatureHex,
      },
    });
  }
}
