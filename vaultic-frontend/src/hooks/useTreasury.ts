"use client";

/**
 * useTreasury — shared hook resolving the admin's `TreasuryConfig` PDA
 * (Task 26.1).
 *
 * Dashboard pages all need the treasury public key (for `memcmp` filters
 * against child PDAs) plus the decoded treasury account data (name,
 * timestamps, counters). Duplicating the query in every page would cause
 * overlapping fetches and stale-time drift, so we centralise it here.
 *
 * Resolution strategy mirrors `useRole`:
 *   - `program.account.treasuryConfig.all([memcmp { offset: 8, authority }])`
 *     returns every treasury owned by the caller (usually 0 or 1).
 *   - Take the first match. Multi-treasury admins are out of scope for MVP
 *     (Task 26 spec) — a future task can expand this into a selector.
 *
 * Returns `{ treasury, treasuryPda, isLoading }`:
 *   - `treasury` — decoded `TreasuryConfig` data, or `null` when the admin
 *     has no treasury yet.
 *   - `treasuryPda` — `PublicKey` of the owning PDA, or `null`.
 *   - `isLoading` — true while the query is in flight.
 *
 * 30s `staleTime` matches design §3.3.3.
 */
import { type IdlAccounts } from "@coral-xyz/anchor";
import { useWallet } from "@solana/wallet-adapter-react";
import { type PublicKey } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";

import { useVaulticProgram } from "@/lib/anchor";
import type { Vaultic } from "@/lib/idl";

export type TreasuryAccount = IdlAccounts<Vaultic>["treasuryConfig"];

export interface UseTreasuryResult {
  treasury: TreasuryAccount | null;
  treasuryPda: PublicKey | null;
  isLoading: boolean;
  error: unknown;
}

export function useTreasury(): UseTreasuryResult {
  const { publicKey } = useWallet();
  const program = useVaulticProgram();

  const query = useQuery({
    queryKey: ["treasury", publicKey?.toBase58() ?? null],
    queryFn: async () => {
      if (!publicKey || !program) return null;
      const results = await program.account.treasuryConfig.all([
        { memcmp: { offset: 8, bytes: publicKey.toBase58() } },
      ]);
      if (results.length === 0) return null;
      const first = results[0]!;
      return {
        pda: first.publicKey,
        account: first.account as TreasuryAccount,
      };
    },
    staleTime: 30_000,
    enabled: publicKey !== null && program !== null,
  });

  return {
    treasury: query.data?.account ?? null,
    treasuryPda: query.data?.pda ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
}
