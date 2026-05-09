"use client";

/**
 * usePayrollConfig — fetch the `PayrollConfig` PDA for a treasury (Task 26.3).
 *
 * Unlike the list hooks, there's exactly one PayrollConfig per treasury
 * (seeds `[b"payroll_config", treasury]`), so we derive the PDA client-side
 * and fetch the account directly. Returns `null` when the admin hasn't
 * configured salary bands yet — the visualiser uses this to render an empty
 * state CTA (Task 26.3 spec).
 */
import { type IdlAccounts } from "@coral-xyz/anchor";
import { type PublicKey } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";

import { useVaulticProgram } from "@/lib/anchor";
import type { Vaultic } from "@/lib/idl";
import { findPayrollConfigPda } from "@/lib/pda";

export type PayrollConfigAccount = IdlAccounts<Vaultic>["payrollConfig"];

export interface UsePayrollConfigResult {
  config: PayrollConfigAccount | null;
  configPda: PublicKey | null;
  isLoading: boolean;
  error: unknown;
}

export function usePayrollConfig(
  treasuryPda: PublicKey | null,
): UsePayrollConfigResult {
  const program = useVaulticProgram();

  const query = useQuery({
    queryKey: ["payrollConfig", treasuryPda?.toBase58() ?? null],
    queryFn: async () => {
      if (!program || !treasuryPda) return null;
      const [configPda] = findPayrollConfigPda(treasuryPda, program.programId);
      // `fetchNullable` returns `null` when the account doesn't exist yet
      // (i.e. the admin hasn't called `set_payroll_config`).
      const account = await program.account.payrollConfig.fetchNullable(
        configPda,
      );
      return account === null
        ? null
        : { pda: configPda, account: account as PayrollConfigAccount };
    },
    staleTime: 30_000,
    enabled: program !== null && treasuryPda !== null,
  });

  return {
    config: query.data?.account ?? null,
    configPda: query.data?.pda ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
}
