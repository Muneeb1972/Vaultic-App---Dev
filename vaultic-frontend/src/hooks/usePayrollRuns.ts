"use client";

/**
 * usePayrollRuns — list the `PayrollExecution` PDAs belonging to a treasury
 * (Task 26.1 and 26.3).
 *
 * Filters by the stored `treasury: Pubkey` field at offset 8 (immediately
 * after the 8-byte Anchor account discriminator). Sorted newest first via
 * `started_at` so the dashboard shows the most recent run up top.
 *
 * Callers pass the treasury PDA; the hook is intentionally decoupled from
 * `useTreasury` so pages that already have the PDA can use it without
 * re-resolving.
 */
import { type IdlAccounts } from "@coral-xyz/anchor";
import { type PublicKey } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";

import { useVaulticProgram } from "@/lib/anchor";
import type { Vaultic } from "@/lib/idl";

export type PayrollExecutionAccount = IdlAccounts<Vaultic>["payrollExecution"];

export interface PayrollRun {
  publicKey: PublicKey;
  account: PayrollExecutionAccount;
}

export function usePayrollRuns(
  treasuryPda: PublicKey | null,
  limit = 50,
) {
  const program = useVaulticProgram();

  return useQuery({
    queryKey: ["payrollRuns", treasuryPda?.toBase58() ?? null, limit],
    queryFn: async (): Promise<PayrollRun[]> => {
      if (!program || !treasuryPda) return [];
      const results = await program.account.payrollExecution.all([
        { memcmp: { offset: 8, bytes: treasuryPda.toBase58() } },
      ]);
      // Sort newest-first by `started_at` (i64 serialized as BN).
      const sorted = [...results].sort((a, b) => {
        const aStart = (a.account as PayrollExecutionAccount).startedAt;
        const bStart = (b.account as PayrollExecutionAccount).startedAt;
        return bStart.cmp(aStart);
      });
      return sorted.slice(0, limit).map((entry) => ({
        publicKey: entry.publicKey,
        account: entry.account as PayrollExecutionAccount,
      }));
    },
    staleTime: 30_000,
    enabled: program !== null && treasuryPda !== null,
  });
}
