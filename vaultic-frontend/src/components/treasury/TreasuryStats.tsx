"use client";

/**
 * TreasuryStats — 4-card summary block for the admin dashboard (Task 26.1,
 * Req 14.1–14.4).
 *
 * Cards:
 *   - Total employees (`treasury.total_employees`)
 *   - Last payroll timestamp (`last_payroll_timestamp`, formatted as local
 *     date; `Never` for the sentinel 0)
 *   - Spending limit per tx (`spending_limit_per_tx`, in SOL)
 *   - Treasury balance (`connection.getBalance(treasuryPda)`, in SOL)
 *
 * The balance query is keyed separately so it refreshes on its own 30s
 * cadence without re-fetching the full treasury account. `enabled` gates
 * both queries until the admin has a resolved treasury PDA.
 */
import { useConnection } from "@solana/wallet-adapter-react";
import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatLamportsSol, formatUnixTimestamp } from "@/lib/format";
import type { TreasuryAccount } from "@/hooks/useTreasury";
import type { PublicKey } from "@solana/web3.js";

export interface TreasuryStatsProps {
  treasury: TreasuryAccount | null;
  treasuryPda: PublicKey | null;
  isLoading?: boolean;
}

export function TreasuryStats({
  treasury,
  treasuryPda,
  isLoading,
}: TreasuryStatsProps) {
  const { connection } = useConnection();

  // Balance query — fetches the raw lamport balance of the treasury PDA.
  const { data: balance } = useQuery({
    queryKey: ["treasuryBalance", treasuryPda?.toBase58() ?? null],
    queryFn: async () => {
      if (!treasuryPda) return 0;
      return connection.getBalance(treasuryPda);
    },
    staleTime: 30_000,
    enabled: treasuryPda !== null,
  });

  if (isLoading || !treasury) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const stats = [
    {
      label: "Total Employees",
      value: treasury.totalEmployees.toString(),
    },
    {
      label: "Last Payroll",
      value: formatUnixTimestamp(treasury.lastPayrollTimestamp),
    },
    {
      label: "Spending Limit / tx",
      value: formatLamportsSol(treasury.spendingLimitPerTx),
    },
    {
      label: "Treasury Balance",
      value: formatLamportsSol(balance ?? 0),
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {stat.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-foreground">
              {stat.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
