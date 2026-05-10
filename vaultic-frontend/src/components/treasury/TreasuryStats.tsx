"use client";

import { useConnection } from "@solana/wallet-adapter-react";
import { useQuery } from "@tanstack/react-query";
import { Users, Clock, ArrowUpDown, Wallet } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { formatLamportsSol, formatUnixTimestamp } from "@/lib/format";
import type { TreasuryAccount } from "@/hooks/useTreasury";
import type { PublicKey } from "@solana/web3.js";

export interface TreasuryStatsProps {
  treasury: TreasuryAccount | null;
  treasuryPda: PublicKey | null;
  isLoading?: boolean;
}

const STAT_META = [
  {
    label: "Total Employees",
    icon: Users,
    gradient: "from-blue-500/20 to-cyan-500/10",
    iconBg: "rgba(59,130,246,0.15)",
    iconColor: "#60a5fa",
    glowColor: "rgba(59,130,246,0.12)",
    borderHover: "rgba(59,130,246,0.35)",
  },
  {
    label: "Last Payroll",
    icon: Clock,
    gradient: "from-violet-500/20 to-purple-500/10",
    iconBg: "rgba(139,92,246,0.15)",
    iconColor: "#a78bfa",
    glowColor: "rgba(139,92,246,0.12)",
    borderHover: "rgba(139,92,246,0.35)",
  },
  {
    label: "Spending Limit / tx",
    icon: ArrowUpDown,
    gradient: "from-indigo-500/20 to-blue-500/10",
    iconBg: "rgba(99,102,241,0.15)",
    iconColor: "#818cf8",
    glowColor: "rgba(99,102,241,0.12)",
    borderHover: "rgba(99,102,241,0.35)",
  },
  {
    label: "Treasury Balance",
    icon: Wallet,
    gradient: "from-cyan-500/20 to-teal-500/10",
    iconBg: "rgba(6,182,212,0.15)",
    iconColor: "#22d3ee",
    glowColor: "rgba(6,182,212,0.12)",
    borderHover: "rgba(6,182,212,0.35)",
  },
];

export function TreasuryStats({ treasury, treasuryPda, isLoading }: TreasuryStatsProps) {
  const { connection } = useConnection();

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
          <Skeleton key={i} className="h-28 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  const stats = [
    { value: treasury.totalEmployees.toString() },
    { value: formatUnixTimestamp(treasury.lastPayrollTimestamp) },
    { value: formatLamportsSol(treasury.spendingLimitPerTx) },
    { value: formatLamportsSol(balance ?? 0) },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, i) => {
        const meta = STAT_META[i]!;
        const Icon = meta.icon;
        return (
          <div
            key={meta.label}
            className="group relative overflow-hidden rounded-2xl p-5 transition-all duration-300 hover:-translate-y-0.5"
            style={{
              background: "rgba(10,10,20,0.7)",
              border: "1px solid rgba(255,255,255,0.06)",
              backdropFilter: "blur(16px)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = meta.borderHover;
              (e.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 32px ${meta.glowColor}`;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.06)";
              (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
            }}
          >
            {/* Hover gradient fill */}
            <div
              className={`absolute inset-0 bg-gradient-to-br ${meta.gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
            />
            {/* Top accent line */}
            <div
              className="absolute inset-x-0 top-0 h-px opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              style={{ background: `linear-gradient(90deg, transparent, ${meta.iconColor}80, transparent)` }}
            />

            <div className="relative flex items-start justify-between">
              <div>
                <p className="mb-3 text-xs font-medium uppercase tracking-widest" style={{ color: "rgba(148,163,184,0.7)" }}>
                  {meta.label}
                </p>
                <p
                  className="text-2xl font-bold"
                  style={{
                    background: `linear-gradient(135deg, #f0f4ff, ${meta.iconColor})`,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  {stat.value}
                </p>
              </div>
              <div
                className="flex h-9 w-9 items-center justify-center rounded-xl"
                style={{ background: meta.iconBg }}
              >
                <Icon className="h-4 w-4" style={{ color: meta.iconColor }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
