"use client";

import { AlertCircle, TrendingUp } from "lucide-react";
import { PayrollRunsList } from "@/components/payroll/PayrollRunsList";
import { TreasuryStats } from "@/components/treasury/TreasuryStats";
import { usePayrollRuns } from "@/hooks/usePayrollRuns";
import { useTreasury } from "@/hooks/useTreasury";

/* ── Empty state ─────────────────────────────────────────────────────── */
function NoTreasuryState() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div
        className="w-full max-w-md rounded-2xl p-8 text-center"
        style={{
          background: "rgba(10,10,20,0.7)",
          border: "1px solid rgba(99,102,241,0.2)",
          backdropFilter: "blur(16px)",
        }}
      >
        <div
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.2)" }}
        >
          <AlertCircle className="h-6 w-6" style={{ color: "#818cf8" }} />
        </div>
        <h2 className="mb-2 text-lg font-semibold text-white">No Treasury Found</h2>
        <p className="text-sm leading-relaxed" style={{ color: "rgba(148,163,184,0.7)" }}>
          This wallet has no TreasuryConfig PDA bound to it yet. Initialise a
          treasury to get started.
        </p>
      </div>
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────────────── */
export default function DashboardHome() {
  const { treasury, treasuryPda, isLoading } = useTreasury();
  const { data: runs, isLoading: runsLoading } = usePayrollRuns(treasuryPda, 10);

  if (!isLoading && !treasury) {
    return <NoTreasuryState />;
  }

  return (
    <main
      className="relative min-h-screen"
      style={{ background: "#05050f" }}
    >
      {/* Background gradients matching landing page */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 40% at 50% 0%, rgba(99,102,241,0.1) 0%, transparent 60%)," +
            "radial-gradient(ellipse 40% 30% at 90% 80%, rgba(59,130,246,0.07) 0%, transparent 50%)",
        }}
      />

      <div className="relative mx-auto max-w-6xl space-y-6 px-6 py-8">

        {/* ── Page header ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span
                className="text-xs font-medium uppercase tracking-widest"
                style={{ color: "rgba(99,102,241,0.7)" }}
              >
                Admin Dashboard
              </span>
            </div>
            <h1
              className="text-2xl font-bold md:text-3xl"
              style={{
                background: "linear-gradient(135deg, #f0f4ff 0%, #c7d2fe 50%, #a5b4fc 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              {treasury?.name ?? "My DAO Treasury"}
            </h1>
          </div>

          {/* Live indicator */}
          <div
            className="hidden items-center gap-2 rounded-full px-3 py-1.5 md:flex"
            style={{
              background: "rgba(52,211,153,0.08)",
              border: "1px solid rgba(52,211,153,0.2)",
            }}
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-xs font-medium" style={{ color: "#6ee7b7" }}>
              Live · Devnet
            </span>
          </div>
        </div>

        {/* ── Stat cards ──────────────────────────────────────────── */}
        <TreasuryStats
          treasury={treasury}
          treasuryPda={treasuryPda}
          isLoading={isLoading}
        />

        {/* ── Payroll runs ────────────────────────────────────────── */}
        <div>
          <PayrollRunsList runs={runs} isLoading={runsLoading} limit={10} />
        </div>

        {/* ── Quick actions strip ──────────────────────────────────── */}
        <div
          className="rounded-2xl p-4"
          style={{
            background: "rgba(10,10,20,0.5)",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4" style={{ color: "rgba(99,102,241,0.6)" }} />
            <span className="text-xs font-medium uppercase tracking-widest" style={{ color: "rgba(203,213,225,0.75)" }}>
              Quick Navigation
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {[
              { label: "Manage Employees", href: "/dashboard/employees", color: "#60a5fa" },
              { label: "Run Payroll",       href: "/dashboard/payroll",   color: "#a78bfa" },
              { label: "Set Policies",      href: "/dashboard/policies",  color: "#818cf8" },
              { label: "View Portal",       href: "/portal",              color: "#22d3ee" },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="group flex items-center justify-center rounded-xl px-3 py-2.5 text-xs font-medium transition-all duration-200"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.14)",
                  color: "rgba(203,213,225,0.85)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.background = `${item.color}12`;
                  (e.currentTarget as HTMLAnchorElement).style.borderColor = `${item.color}40`;
                  (e.currentTarget as HTMLAnchorElement).style.color = item.color;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.05)";
                  (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(255,255,255,0.14)";
                  (e.currentTarget as HTMLAnchorElement).style.color = "rgba(203,213,225,0.85)";
                }}
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>

      </div>
    </main>
  );
}
