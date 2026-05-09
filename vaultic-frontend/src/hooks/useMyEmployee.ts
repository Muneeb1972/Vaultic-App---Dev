"use client";

/**
 * useMyEmployee — resolves the connected wallet's `EmployeeRecord` PDA
 * (Task 27.1, Req 18.1).
 *
 * Mirrors the `employee` branch of `useRole`: the `EmployeeRecord.employee_wallet`
 * field sits at offset 40 (8-byte Anchor discriminator + 32-byte
 * `treasury: Pubkey`), so a single `memcmp` against that offset returns
 * at most one record per employee.
 *
 * Returns:
 *   - `employee`     — decoded `EmployeeRecord` data, or `null` when the
 *                      connected wallet is not an employee.
 *   - `employeePda`  — `PublicKey` of the owning PDA, or `null`.
 *   - `treasuryPda`  — `PublicKey` of the parent treasury (read from
 *                      `employee.treasury`), or `null`. Surfaced here so
 *                      child queries (claims, policies) can key off it
 *                      without re-resolving via `useTreasury`, which is
 *                      admin-scoped.
 *   - `isLoading`    — true while the query is in flight.
 *
 * 30s `staleTime` matches design §3.3.3.
 */
import { type IdlAccounts } from "@coral-xyz/anchor";
import { useWallet } from "@solana/wallet-adapter-react";
import { type PublicKey } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";

import { useVaulticProgram } from "@/lib/anchor";
import type { Vaultic } from "@/lib/idl";

export type EmployeeRecordAccount = IdlAccounts<Vaultic>["employeeRecord"];

export interface UseMyEmployeeResult {
  employee: EmployeeRecordAccount | null;
  employeePda: PublicKey | null;
  treasuryPda: PublicKey | null;
  isLoading: boolean;
  error: unknown;
}

export function useMyEmployee(): UseMyEmployeeResult {
  const { publicKey } = useWallet();
  const program = useVaulticProgram();

  const query = useQuery({
    queryKey: ["myEmployee", publicKey?.toBase58() ?? null],
    queryFn: async () => {
      if (!publicKey || !program) return null;
      const results = await program.account.employeeRecord.all([
        { memcmp: { offset: 8 + 32, bytes: publicKey.toBase58() } },
      ]);
      if (results.length === 0) return null;
      const first = results[0]!;
      return {
        pda: first.publicKey,
        account: first.account as EmployeeRecordAccount,
      };
    },
    staleTime: 30_000,
    enabled: publicKey !== null && program !== null,
  });

  return {
    employee: query.data?.account ?? null,
    employeePda: query.data?.pda ?? null,
    treasuryPda: query.data?.account?.treasury ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
}
