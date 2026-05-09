"use client";

/**
 * Payroll page (Task 26.3, Req 16).
 *
 * Composes the payroll-domain widgets:
 *   - `PayrollConfigForm`    — plaintext-first payroll config (encrypt-integration Req 1.2)
 *   - `SalaryBandVisualizer` — 5 tier encrypted-band rows
 *   - `ExecutePayrollButton` — interval-gated CTA
 *   - `PayrollHistoryTable`  — up to 50 recent runs
 */
import { useState } from "react";
import { ExecutePayrollButton } from "@/components/payroll/ExecutePayrollButton";
import { PayrollConfigForm } from "@/components/payroll/PayrollConfigForm";
import { PayrollHistoryTable } from "@/components/payroll/PayrollHistoryTable";
import { SalaryBandVisualizer } from "@/components/payroll/SalaryBandVisualizer";
import { Button } from "@/components/ui/button";
import { useEmployees } from "@/hooks/useEmployees";
import { usePayrollConfig } from "@/hooks/usePayrollConfig";
import { usePayrollRuns } from "@/hooks/usePayrollRuns";
import { useTreasury } from "@/hooks/useTreasury";

export default function PayrollPage() {
  const { treasury, treasuryPda, isLoading: treasuryLoading } = useTreasury();
  const { config, isLoading: configLoading } = usePayrollConfig(treasuryPda);
  const { data: employees } = useEmployees(treasuryPda);
  const { data: runs, isLoading: runsLoading } = usePayrollRuns(
    treasuryPda,
    50,
  );
  const [showConfigForm, setShowConfigForm] = useState(false);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-foreground">Payroll</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowConfigForm((v) => !v)}
          >
            {showConfigForm ? "Hide config" : "Configure payroll"}
          </Button>
          {treasury && treasuryPda ? (
            <ExecutePayrollButton
              treasury={treasury}
              treasuryPda={treasuryPda}
              payrollConfig={config}
              employees={employees}
            />
          ) : null}
        </div>
      </div>

      {/* Payroll config form — shown on demand (encrypt-integration Req 1.2) */}
      {showConfigForm && treasuryPda && (
        <div className="rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-medium">Payroll configuration</h2>
          <PayrollConfigForm treasuryPda={treasuryPda} />
        </div>
      )}

      <SalaryBandVisualizer
        config={config}
        isLoading={treasuryLoading || configLoading}
      />

      <PayrollHistoryTable runs={runs} isLoading={runsLoading} />
    </main>
  );
}
