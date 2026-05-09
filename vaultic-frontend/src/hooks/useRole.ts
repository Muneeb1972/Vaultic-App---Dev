'use client';

/**
 * useRole — resolves the connected wallet's role via on-chain `memcmp`
 * filters (Task 24.1, design §3.3.5, Req 19.2).
 *
 * Resolution order:
 *   1. No wallet → `'guest'` (query is disabled via `enabled:` below, but we
 *      still emit the constant so callers can branch on `data`).
 *   2. Wallet connected but program not ready (e.g. mid-reconnect) →
 *      `'unknown'`. The hook does not throw so layouts can redirect cleanly.
 *   3. Wallet matches any `TreasuryConfig.authority` (offset 8, right after
 *      the 8-byte Anchor account discriminator) → `'admin'`.
 *   4. Wallet matches any `EmployeeRecord.employee_wallet` (offset 8 + 32 =
 *      40; the preceding `treasury: Pubkey` field occupies the 32 bytes
 *      between the discriminator and the employee wallet) → `'employee'`.
 *   5. Otherwise → `'unknown'`.
 *
 * The two `memcmp` filters are the cheapest on-chain role check available:
 * each one ships as a single `getProgramAccounts` RPC call with a 32-byte
 * filter, so the server returns only accounts that already match the caller
 * instead of streaming every treasury or employee record.
 *
 * TanStack Query config:
 *   - `queryKey` is scoped to the wallet's base58 address so a wallet swap
 *     invalidates cleanly without manual `invalidateQueries`.
 *   - `staleTime: 30_000` matches the 30-second budget called out in Req
 *     14.5 / 20.5 so the role doesn't refetch on every hover or re-render.
 *   - `enabled: publicKey !== null` keeps the query idle while disconnected;
 *     the `publicKey` guard in `queryFn` is a belt-and-braces fallback for
 *     the brief window between `publicKey` becoming non-null and `enabled`
 *     picking it up on the next render.
 */
import { useWallet } from '@solana/wallet-adapter-react';
import { useQuery } from '@tanstack/react-query';

import { useVaulticProgram } from '@/lib/anchor';

export type Role = 'admin' | 'employee' | 'guest' | 'unknown' | 'loading';

export function useRole() {
  const { publicKey } = useWallet();
  const program = useVaulticProgram();

  return useQuery({
    queryKey: ['role', publicKey?.toBase58() ?? null],
    queryFn: async () => {
      if (!publicKey) return 'guest' as const;
      if (!program) return 'unknown' as const;

      // Check TreasuryConfig.authority (offset 8 = after 8-byte Anchor disc)
      const treasuries = await program.account.treasuryConfig.all([
        { memcmp: { offset: 8, bytes: publicKey.toBase58() } },
      ]);
      if (treasuries.length > 0) return 'admin' as const;

      // Check EmployeeRecord.employee_wallet (offset 8 + 32 = after disc + treasury Pubkey)
      const employees = await program.account.employeeRecord.all([
        { memcmp: { offset: 8 + 32, bytes: publicKey.toBase58() } },
      ]);
      if (employees.length > 0) return 'employee' as const;

      return 'unknown' as const;
    },
    staleTime: 30_000,
    enabled: publicKey !== null,
  });
}
