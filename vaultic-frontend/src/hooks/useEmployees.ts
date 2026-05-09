"use client";

/**
 * useEmployees — list `EmployeeRecord` PDAs for a given treasury (Task 26.2).
 *
 * `treasury: Pubkey` is the first field after the 8-byte discriminator,
 * which makes the memcmp filter offset 8 (same pattern as
 * `usePayrollRuns`).
 *
 * Kept framework-thin: no backend coupling here — the dashboard table
 * displays on-chain data. The backend's `Employee` row (carrying `name` /
 * `email`) is populated separately by `AddEmployeeDialog` and can be
 * joined client-side if a future task needs it.
 */
import { type IdlAccounts } from "@coral-xyz/anchor";
import { type PublicKey } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";

import { useVaulticProgram } from "@/lib/anchor";
import type { Vaultic } from "@/lib/idl";

export type EmployeeAccount = IdlAccounts<Vaultic>["employeeRecord"];

export interface EmployeeEntry {
  publicKey: PublicKey;
  account: EmployeeAccount;
}

export function useEmployees(treasuryPda: PublicKey | null) {
  const program = useVaulticProgram();

  return useQuery({
    queryKey: ["employees", treasuryPda?.toBase58() ?? null],
    queryFn: async (): Promise<EmployeeEntry[]> => {
      if (!program || !treasuryPda) return [];
      const results = await program.account.employeeRecord.all([
        { memcmp: { offset: 8, bytes: treasuryPda.toBase58() } },
      ]);
      return results.map((entry) => ({
        publicKey: entry.publicKey,
        account: entry.account as EmployeeAccount,
      }));
    },
    staleTime: 30_000,
    enabled: program !== null && treasuryPda !== null,
  });
}
