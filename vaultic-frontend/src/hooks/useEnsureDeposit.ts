/**
 * `useEnsureDeposit` — React hook for the one-time Encrypt deposit bootstrap.
 *
 * Wraps `ensureDeposit` with:
 * - Session-level memoization of the "deposit exists" result.
 * - `EncryptPhase` state machine integration for the `EnsureDeposit` indicator.
 * - Automatic invocation on wallet connection (called from the admin layout).
 *
 * encrypt-integration Req 3.2–3.5, design §3.3.3
 */

'use client';

import { useCallback, useRef, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { ensureDeposit } from '@/lib/encrypt/ensureDeposit';
import type { EncryptPhase } from '@/lib/encrypt/types';
import { DepositEnsureFailedError } from '@/lib/encrypt/types';

export interface UseEnsureDepositResult {
  /**
   * Call this before any mutation that creates a ciphertext.
   * No-ops if the deposit already exists (Req 3.3).
   * Throws `DepositEnsureFailedError` on failure.
   */
  ensureDeposit: () => Promise<void>;
  /** True once the deposit PDA has been confirmed to exist for this session. */
  isEnsured: boolean;
  /** Current phase — `EnsureDeposit` while the bootstrap tx is in flight. */
  phase: EncryptPhase;
}

export function useEnsureDeposit(): UseEnsureDepositResult {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [isEnsured, setIsEnsured] = useState(false);
  const [phase, setPhase] = useState<EncryptPhase>({ kind: 'Idle' });

  // Prevent concurrent calls — if one is already in flight, return the same promise.
  const inFlightRef = useRef<Promise<void> | null>(null);

  const run = useCallback(async (): Promise<void> => {
    // Already confirmed for this session — no-op (Req 3.3).
    if (isEnsured) return;

    // Deduplicate concurrent calls.
    if (inFlightRef.current) return inFlightRef.current;

    const promise = (async () => {
      setPhase({ kind: 'EnsureDeposit' });
      try {
        await ensureDeposit(connection, wallet);
        setIsEnsured(true);
        setPhase({ kind: 'Idle' });
      } catch (err) {
        const typed =
          err instanceof DepositEnsureFailedError
            ? err
            : new DepositEnsureFailedError(err);
        setPhase({
          kind: 'Error',
          type: 'DepositEnsureFailed',
          message: typed.message,
        });
        throw typed;
      } finally {
        inFlightRef.current = null;
      }
    })();

    inFlightRef.current = promise;
    return promise;
  }, [connection, wallet, isEnsured]);

  return { ensureDeposit: run, isEnsured, phase };
}
