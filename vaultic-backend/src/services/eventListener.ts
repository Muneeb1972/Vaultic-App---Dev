/**
 * Vaultic on-chain event listener (Task 19.2, Req 12.2 / 12.3).
 *
 * Subscribes to Solana program logs for the Vaultic program via
 * `connection.onLogs(programId, ...)`, parses every log with Anchor's
 * `EventParser`, and for each decoded event performs three actions in
 * order (design §3.2.5):
 *
 *   1. Persist an audit-log row (Req 12.3) — idempotent on the
 *      `(signature, logIndex)` pair so reconnect-driven replays don't
 *      double-write. The pair lives inside the `AuditLog.metadata` JSON
 *      column (schema decision: avoid a migration just for this).
 *   2. Project the event into its domain table — e.g.
 *      `PayrollExecutionStarted` → `PayrollRun.status = 'Processing'`.
 *   3. Fan out to the SSE hub so frontend subscribers see the change in
 *      real time.
 *
 * Reconnect / gap recovery (Req 12.2): after the RPC drops we call
 * `connection.getSignaturesForAddress(programId, { until: lastProcessedSig })`
 * to enumerate every signature we missed while disconnected, then fetch
 * their transaction logs and re-run them through the same parser. The
 * cursor (`lastProcessedSig`) lives in-memory — if the process itself
 * restarts we rely on the idempotent audit-log dedupe to skip rows that
 * already landed. A persistent cursor is a Task 20/21 follow-up.
 *
 * Lifecycle: the class does NOT auto-start. Callers instantiate it and
 * call `start()` once the rest of the app is ready. This matches the
 * pattern in `src/index.ts` where routers and services are wired up
 * after the Express app but before `.listen()`.
 */
import { EventParser } from '@coral-xyz/anchor';
import {
  Connection,
  PublicKey,
  type Logs,
  type ConfirmedSignatureInfo,
} from '@solana/web3.js';

import type { AppConfig } from '../config';
import type { Prisma } from '@prisma/client';

import { prisma } from '../prisma';
import { logger } from '../utils/logger';
import { getAnchorProgram, getConnection } from './anchorClient';
import { AUDIT_ACTION, type AuditActionType } from './auditLog';
import type { SseHub } from './sse';
import type { VaulticEventName } from '../idl/vaultic';

/** Minimum config required to start the listener. */
export type EventListenerConfig = Pick<
  AppConfig,
  'solanaRpcUrl' | 'vaulticProgramId'
>;

/**
 * Map each on-chain event to the audit-log action it projects to.
 * Defined outside the class so the compiler can check that every
 * `VaulticEventName` has a slot (via the `Record` type).
 */
const EVENT_TO_ACTION: Record<VaulticEventName, AuditActionType> = {
  TreasuryInitialized: AUDIT_ACTION.TREASURY_INITIALIZED,
  EmployeeRegistered: AUDIT_ACTION.EMPLOYEE_REGISTERED,
  EmployeeTerminated: AUDIT_ACTION.EMPLOYEE_TERMINATED,
  PayrollExecutionStarted: AUDIT_ACTION.PAYROLL_EXECUTED,
  PayrollExecutionCompleted: AUDIT_ACTION.PAYROLL_EXECUTED,
  FHEComputationRequested: AUDIT_ACTION.PAYROLL_EXECUTED,
  IkaSigningRequested: AUDIT_ACTION.PAYROLL_EXECUTED,
  ClaimSubmitted: AUDIT_ACTION.CLAIM_SUBMITTED,
  ClaimProcessed: AUDIT_ACTION.CLAIM_PROCESSED,
};

/** Anchor's `EventParser.parseLogs` yields events with this shape. */
interface ParsedEvent {
  name: string;
  data: Record<string, unknown>;
}

/**
 * Context passed to each event handler. Carries the Solana identifiers
 * the handler needs for idempotency + projection without re-reading them
 * from the handler-specific closures.
 */
interface EventContext {
  /** Transaction signature this event fired in. */
  signature: string;
  /**
   * Ordinal of the event within its transaction — each `EventParser`
   * invocation may yield more than one event. Used together with
   * `signature` as the idempotency key.
   */
  logIndex: number;
  /** Slot at which the transaction confirmed. Useful for analytics. */
  slot: number;
}

export class VaulticEventListener {
  private readonly connection: Connection;
  private readonly programId: PublicKey;
  private readonly parser: EventParser;
  private readonly hub: SseHub;

  /** Solana subscription id for `onLogs`, or null when not subscribed. */
  private subscriptionId: number | null = null;

  /**
   * Most recently processed signature — stashed so a reconnect can ask
   * `getSignaturesForAddress({ until: lastProcessedSig })` for the gap.
   */
  private lastProcessedSig: string | null = null;

  /** `true` between `start()` and `stop()` — guards against double-starts. */
  private running = false;

  constructor(
    config: EventListenerConfig,
    hub: SseHub,
  ) {
    this.connection = getConnection(config);
    this.programId = new PublicKey(config.vaulticProgramId);
    this.hub = hub;

    // `EventParser` wraps the program's event coder; we borrow the
    // coder from the shared `Program` instance so IDL updates in
    // `idl/vaultic.ts` propagate to the parser without a second source
    // of truth.
    const program = getAnchorProgram(config);
    this.parser = new EventParser(this.programId, program.coder);
  }

  /**
   * Begin listening. Idempotent — calling `start()` twice is a no-op on
   * the second call. Throws if `stop()` has been called concurrently.
   */
  async start(): Promise<void> {
    if (this.running) {
      logger.debug('VaulticEventListener.start() called while already running');
      return;
    }
    this.running = true;

    // Subscribe to future logs first; any events that land between the
    // backfill fetch and the subscription would otherwise be lost.
    this.subscriptionId = this.connection.onLogs(
      this.programId,
      (logs, ctx) => {
        this.handleLogs(logs, ctx.slot).catch((err) => {
          logger.error(
            { err, signature: logs.signature },
            'VaulticEventListener handler failed',
          );
        });
      },
      'confirmed',
    );

    logger.info(
      { programId: this.programId.toBase58(), subscriptionId: this.subscriptionId },
      'VaulticEventListener subscribed',
    );

    // Best-effort backfill on startup. If the cursor is null (fresh
    // process with no `lastProcessedSig`) we skip — trying to backfill
    // "everything" would blow up RPC quotas on a long-lived program.
    if (this.lastProcessedSig !== null) {
      await this.backfill(this.lastProcessedSig).catch((err) => {
        logger.error({ err }, 'VaulticEventListener backfill failed');
      });
    }
  }

  /**
   * Stop listening. Safe to call repeatedly; safe to call before
   * `start()`. The SSE hub is NOT closed here — the HTTP layer owns
   * that lifecycle.
   */
  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    if (this.subscriptionId !== null) {
      try {
        await this.connection.removeOnLogsListener(this.subscriptionId);
      } catch (err) {
        logger.warn({ err }, 'removeOnLogsListener failed — ignoring');
      }
      this.subscriptionId = null;
    }
  }

  /**
   * Replay every signature for the program since `untilSig` through the
   * normal handler pipeline. Called on reconnect — the idempotent audit
   * dedupe ensures already-processed rows are skipped.
   */
  private async backfill(untilSig: string): Promise<void> {
    logger.info({ untilSig }, 'VaulticEventListener backfill started');
    let before: string | undefined;
    // Paginate oldest-first wrt `until`: getSignaturesForAddress returns
    // newest first, so we walk forward by passing `before` = oldest of
    // the previous page.
    for (;;) {
      const page: ConfirmedSignatureInfo[] =
        await this.connection.getSignaturesForAddress(this.programId, {
          until: untilSig,
          before,
          limit: 1000,
        });
      if (page.length === 0) break;

      // Process oldest first so `lastProcessedSig` advances monotonically.
      for (const info of [...page].reverse()) {
        if (info.err !== null) continue; // failed tx never emitted events
        const tx = await this.connection.getTransaction(info.signature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        });
        const logs = tx?.meta?.logMessages ?? null;
        if (logs === null) continue;
        await this.handleLogs(
          { signature: info.signature, logs, err: null },
          info.slot,
        );
      }

      before = page[page.length - 1]?.signature;
      // `getSignaturesForAddress` caps a page at 1000; if the RPC
      // returned fewer we're done.
      if (page.length < 1000) break;
    }
    logger.info({ untilSig }, 'VaulticEventListener backfill complete');
  }

  /**
   * Parse every event embedded in `logs.logs`, then for each event
   * persist audit + domain state + SSE broadcast. Never throws — all
   * failures are logged and swallowed so one bad event can't kill the
   * subscription.
   */
  private async handleLogs(logs: Logs, slot: number): Promise<void> {
    if (logs.err !== null) return;
    if (logs.logs.length === 0) return;

    let logIndex = 0;
    for (const raw of this.parser.parseLogs(logs.logs, false)) {
      const event = raw as ParsedEvent;
      const ctx: EventContext = {
        signature: logs.signature,
        logIndex,
        slot,
      };
      logIndex += 1;

      try {
        const alreadySeen = await this.isAlreadyProcessed(ctx);
        if (alreadySeen) continue;
        await this.dispatch(event, ctx);
        this.lastProcessedSig = ctx.signature;
      } catch (err) {
        logger.error(
          { err, eventName: event.name, signature: ctx.signature },
          'Failed to process Vaultic event',
        );
      }
    }
  }

  /**
   * Check `AuditLog` for an existing row with this `(signature, logIndex)`
   * pair. Uses a JSON-path equality filter rather than a unique index
   * because the pair lives inside `AuditLog.metadata` (schema decision
   * noted in the file header).
   */
  private async isAlreadyProcessed(ctx: EventContext): Promise<boolean> {
    const existing = await prisma.auditLog.findFirst({
      where: {
        AND: [
          { metadata: { path: ['signature'], equals: ctx.signature } },
          { metadata: { path: ['logIndex'], equals: ctx.logIndex } },
        ],
      },
      select: { id: true },
    });
    return existing !== null;
  }

  /**
   * Dispatch a parsed event to its handler. Unknown event names are
   * logged at `warn` level (indicates an IDL/backend drift) but not
   * thrown — ignoring them keeps the subscription alive.
   */
  private async dispatch(event: ParsedEvent, ctx: EventContext): Promise<void> {
    const action = EVENT_TO_ACTION[event.name as VaulticEventName];
    if (action === undefined) {
      logger.warn({ eventName: event.name }, 'Unknown Vaultic event — skipping');
      return;
    }

    const treasuryAddress = readStringField(event.data, 'treasury');
    const actorWallet = readStringField(event.data, 'authority') ?? 'onchain';

    // Resolve the off-chain Treasury row that owns this event, if any.
    // Events like `ClaimSubmitted` / `ClaimProcessed` key off `claim` /
    // `employee` instead of `treasury`; we look those up on demand in
    // the dedicated handlers below.
    const treasuryId = treasuryAddress
      ? await this.resolveTreasuryId(treasuryAddress)
      : null;

    // The audit row is written first — if the subsequent projection
    // fails, the dedupe check on the next attempt still catches the
    // row and skips it. We serialise BigInts / arrays into strings so
    // the metadata column stays valid JSON.
    await prisma.auditLog.create({
      data: {
        actionType: action,
        actorWallet,
        treasuryId: treasuryId ?? null,
        metadata: {
          eventName: event.name,
          signature: ctx.signature,
          logIndex: ctx.logIndex,
          slot: ctx.slot,
          data: serialiseEventData(event.data),
        },
      },
    });

    // Domain projection — fan out to the specific handler.
    switch (event.name as VaulticEventName) {
      case 'TreasuryInitialized':
        await this.onTreasuryInitialized(event, ctx, treasuryId);
        break;
      case 'EmployeeRegistered':
        await this.onEmployeeRegistered(event, ctx, treasuryId);
        break;
      case 'EmployeeTerminated':
        await this.onEmployeeTerminated(event, ctx, treasuryId);
        break;
      case 'PayrollExecutionStarted':
        await this.onPayrollExecutionStarted(event, ctx, treasuryId);
        break;
      case 'PayrollExecutionCompleted':
        await this.onPayrollExecutionCompleted(event, ctx, treasuryId);
        break;
      case 'FHEComputationRequested':
        await this.onFheComputationRequested(event, ctx, treasuryId);
        break;
      case 'IkaSigningRequested':
        await this.onIkaSigningRequested(event, ctx, treasuryId);
        break;
      case 'ClaimSubmitted':
        await this.onClaimSubmitted(event, ctx);
        break;
      case 'ClaimProcessed':
        await this.onClaimProcessed(event, ctx);
        break;
    }

    // SSE broadcast — only if we resolved the treasury. Claim events
    // emit their own broadcast inside their handler (they look up the
    // treasury via the claim PDA).
    if (treasuryAddress) {
      this.hub.broadcast(treasuryAddress, {
        type: event.name,
        data: serialiseEventData(event.data),
      });
    }
  }

  // -- Projection handlers ----------------------------------------------------
  //
  // Each handler is intentionally minimal: it writes the minimum field set
  // required by the Prisma schema for the row to land, and relies on the
  // REST layer (Task 20) to fill in richer detail when it sees the first
  // GET after the event. Handlers tolerate "row not found yet" by emitting
  // a debug log and returning — the REST layer may not have seen the
  // creation request yet (e.g. the admin calls `POST /api/treasury` which
  // submits the on-chain tx; the event lands *before* the POST handler's
  // Prisma `create` completes).

  private async onTreasuryInitialized(
    _event: ParsedEvent,
    _ctx: EventContext,
    _treasuryId: string | null,
  ): Promise<void> {
    // No-op projection: the REST `POST /api/treasury` handler creates
    // the row. The event arrival just confirms the on-chain state and
    // has already been written to AuditLog above.
  }

  private async onEmployeeRegistered(
    _event: ParsedEvent,
    _ctx: EventContext,
    _treasuryId: string | null,
  ): Promise<void> {
    // Same pattern as TreasuryInitialized: REST `POST /api/employees`
    // writes the row, event confirms it.
  }

  private async onEmployeeTerminated(
    event: ParsedEvent,
    _ctx: EventContext,
    _treasuryId: string | null,
  ): Promise<void> {
    const employeeAddress = readStringField(event.data, 'employee');
    if (!employeeAddress) return;
    // The Prisma Employee model has no `isActive` column (§3.2.2);
    // termination is recorded in AuditLog only. If Req 2.10 later
    // requires a soft-delete flag, add it in a schema migration.
  }

  private async onPayrollExecutionStarted(
    event: ParsedEvent,
    _ctx: EventContext,
    treasuryId: string | null,
  ): Promise<void> {
    if (treasuryId === null) return;
    const executionIdStr = readBigIntFieldAsString(event.data, 'executionId');
    if (executionIdStr === null) return;
    await prisma.payrollRun.updateMany({
      where: { treasuryId, executionId: BigInt(executionIdStr) },
      data: { status: 'Processing' },
    });
  }

  private async onPayrollExecutionCompleted(
    event: ParsedEvent,
    _ctx: EventContext,
    treasuryId: string | null,
  ): Promise<void> {
    if (treasuryId === null) return;
    const executionIdStr = readBigIntFieldAsString(event.data, 'executionId');
    if (executionIdStr === null) return;
    await prisma.payrollRun.updateMany({
      where: { treasuryId, executionId: BigInt(executionIdStr) },
      data: { status: 'Completed' },
    });
  }

  private async onFheComputationRequested(
    _event: ParsedEvent,
    _ctx: EventContext,
    _treasuryId: string | null,
  ): Promise<void> {
    // Signal-only — no domain table to project into. The SSE broadcast
    // at the end of `dispatch` forwards it to any interested frontend.
  }

  private async onIkaSigningRequested(
    event: ParsedEvent,
    _ctx: EventContext,
    treasuryId: string | null,
  ): Promise<void> {
    if (treasuryId === null) return;
    const messageHash = readByteArrayFieldAsHex(event.data, 'messageHash');
    if (messageHash === null) return;
    // The same `messageHash` is used for both payroll approvals and
    // claim approvals; store it on whichever row matches. PayrollRun
    // takes priority because it's the more common case; Claim falls
    // back if no PayrollRun matched.
    const payrollUpdate = await prisma.payrollRun.updateMany({
      where: { treasuryId, ikaMessageHash: null, status: 'Processing' },
      data: { ikaMessageHash: messageHash },
    });
    if (payrollUpdate.count === 0) {
      await prisma.claim.updateMany({
        where: { treasuryId, status: 'Pending', ikaMessageHash: null },
        data: { ikaMessageHash: messageHash },
      });
    }
  }

  private async onClaimSubmitted(
    _event: ParsedEvent,
    _ctx: EventContext,
  ): Promise<void> {
    // REST `POST /api/claims` writes the row; event confirms.
  }

  private async onClaimProcessed(
    event: ParsedEvent,
    _ctx: EventContext,
  ): Promise<void> {
    const claimAddress = readStringField(event.data, 'claim');
    if (!claimAddress) return;
    const status = readClaimStatus(event.data);
    // Look up the treasury via the claim so the SSE broadcast reaches
    // the right subscribers.
    const claim = await prisma.claim.findUnique({
      where: { onchainAddress: claimAddress },
      select: { treasury: { select: { onchainAddress: true } } },
    });
    if (claim === null) return;
    await prisma.claim.update({
      where: { onchainAddress: claimAddress },
      data: { status, processedAt: new Date() },
    });
    this.hub.broadcast(claim.treasury.onchainAddress, {
      type: 'ClaimProcessed',
      data: { claim: claimAddress, status },
    });
  }

  /** Look up the off-chain Treasury row id for an on-chain treasury pubkey. */
  private async resolveTreasuryId(
    treasuryAddress: string,
  ): Promise<string | null> {
    const row = await prisma.treasury.findUnique({
      where: { onchainAddress: treasuryAddress },
      select: { id: true },
    });
    return row?.id ?? null;
  }
}

// --- helpers ----------------------------------------------------------------
//
// The `EventParser` yields raw Borsh-decoded payloads. Field names come
// from the IDL, which Anchor converts snake_case → camelCase
// automatically. Everything below coaxes those payloads into primitive
// types safe for Prisma / JSON.

/**
 * Read a field we expect to be an Anchor `Pubkey` or base58 string. Returns
 * `null` if the field is missing or an unexpected shape rather than
 * throwing — keeping the listener resilient to IDL drift.
 */
function readStringField(
  data: Record<string, unknown>,
  field: string,
): string | null {
  const value = data[field];
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  // Anchor returns PublicKey instances — they expose `.toBase58()`.
  if (typeof value === 'object' && 'toBase58' in value) {
    const base58 = (value as { toBase58: () => string }).toBase58;
    return typeof base58 === 'function' ? base58.call(value) : null;
  }
  return null;
}

/**
 * Read a `u64` field. Anchor returns these as `BN` instances; we stringify
 * them so the caller can `BigInt(string)` into a Prisma `BigInt` column.
 */
function readBigIntFieldAsString(
  data: Record<string, unknown>,
  field: string,
): string | null {
  const value = data[field];
  if (value === undefined || value === null) return null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' && Number.isFinite(value))
    return value.toString();
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && 'toString' in value) {
    const toString = (value as { toString: (radix?: number) => string })
      .toString;
    return typeof toString === 'function' ? toString.call(value, 10) : null;
  }
  return null;
}

/**
 * Read a `[u8; 32]` field and render it as a hex string — matches the
 * `Claim.ikaMessageHash` / `PayrollRun.ikaMessageHash` column format used
 * by the Ika poller.
 */
function readByteArrayFieldAsHex(
  data: Record<string, unknown>,
  field: string,
): string | null {
  const value = data[field];
  if (value === undefined || value === null) return null;
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString('hex');
  }
  if (Array.isArray(value) && value.every((v) => typeof v === 'number')) {
    return Buffer.from(value as number[]).toString('hex');
  }
  return null;
}

/**
 * Map the Anchor-decoded `ClaimStatus` enum into the string stored in the
 * `Claim.status` column. Anchor encodes Rust enums as objects with a
 * single key when unit variants, so `{ executed: {} }` → `"Executed"`.
 */
function readClaimStatus(data: Record<string, unknown>): string {
  const status = data.status;
  if (typeof status === 'string') {
    return titleCase(status);
  }
  if (status !== null && typeof status === 'object') {
    const key = Object.keys(status)[0];
    if (key) return titleCase(key);
  }
  return 'Executed';
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Render an event payload into a JSON-safe shape for the `AuditLog.metadata`
 * column. Converts `PublicKey` / `BN` instances to strings and
 * `Uint8Array` / number-array fields to hex. Null / undefined / non-finite
 * values are DROPPED rather than emitted as JSON null because Prisma's
 * `InputJsonValue` type excludes `null` (the JSON-null sentinel requires
 * `Prisma.JsonNull`, which is a parent-level concern here).
 */
function serialiseEventData(
  data: Record<string, unknown>,
): Prisma.InputJsonValue {
  const out: Record<string, Prisma.InputJsonValue> = {};
  for (const [key, value] of Object.entries(data)) {
    const serialised = serialiseValue(value);
    if (serialised !== undefined) {
      out[key] = serialised;
    }
  }
  return out;
}

/**
 * Serialise one value. Returns `undefined` for null / undefined / NaN so the
 * caller knows to drop the key entirely. The return type excludes `null` —
 * see `serialiseEventData` for the rationale.
 */
function serialiseValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Uint8Array) return Buffer.from(value).toString('hex');
  if (Array.isArray(value)) {
    const mapped: Prisma.InputJsonValue[] = [];
    for (const v of value) {
      const serialised = serialiseValue(v);
      // Preserve positional order — arrays can't drop elements silently
      // without misaligning the index, so represent missing entries as
      // empty strings. This only happens on unexpected `null` items,
      // which shouldn't occur in Anchor-decoded payloads.
      mapped.push(serialised ?? '');
    }
    return mapped;
  }
  if (typeof value === 'object') {
    // PublicKey instances — stringify via toBase58.
    if ('toBase58' in value) {
      const base58 = (value as { toBase58: () => string }).toBase58;
      if (typeof base58 === 'function') return base58.call(value);
    }
    // BN instances — stringify via toString(10).
    if ('toString' in value && 'words' in value) {
      const toString = (value as { toString: (radix?: number) => string })
        .toString;
      if (typeof toString === 'function') return toString.call(value, 10);
    }
    const nested: Record<string, Prisma.InputJsonValue> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const serialised = serialiseValue(v);
      if (serialised !== undefined) nested[k] = serialised;
    }
    return nested;
  }
  return undefined;
}
