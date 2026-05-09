"use client";

/**
 * Admin dashboard landing page (Task 26.1, Req 14).
 *
 * Renders four sections stacked vertically:
 *   1. `TreasuryStats` — 4 stat cards (employees, last payroll, spending
 *      limit, balance)
 *   2. `DWalletBadge`  — dWallet binding indicator
 *   3. `PayrollRunsList` — recent payroll executions (limit 10)
 *
 * The empty state (when the admin has no treasury yet) is handled by
 * rendering a CTA card pointing at the `initialize_treasury` flow. That
 * flow isn't wired here — a future task can add it — so we just tell the
 * user what to do.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PayrollRunsList } from "@/components/payroll/PayrollRunsList";
import { DWalletBadge } from "@/components/treasury/DWalletBadge";
import { TreasuryStats } from "@/components/treasury/TreasuryStats";
import { usePayrollRuns } from "@/hooks/usePayrollRuns";
import { useTreasury } from "@/hooks/useTreasury";

export default function DashboardHome() {
  const { treasury, treasuryPda, isLoading } = useTreasury();
  const { data: runs, isLoading: runsLoading } = usePayrollRuns(
    treasuryPda,
    10,
  );

  if (!isLoading && !treasury) {
    return (
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        <h1 className="text-3xl font-semibold text-foreground">Dashboard</h1>
        <Card>
          <CardHeader>
            <CardTitle>No treasury yet</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Initialise a treasury to get started. This wallet has no
              TreasuryConfig PDA bound to it yet.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-foreground">
          {treasury?.name ?? "Dashboard"}
        </h1>
      </div>

      <TreasuryStats
        treasury={treasury}
        treasuryPda={treasuryPda}
        isLoading={isLoading}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <DWalletBadge treasury={treasury} />
        </div>
        <div className="lg:col-span-2">
          <PayrollRunsList runs={runs} isLoading={runsLoading} limit={10} />
        </div>
      </div>
    </main>
  );
}
