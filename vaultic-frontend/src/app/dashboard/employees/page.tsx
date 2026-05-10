"use client";

/**
 * Employees page (Task 26.2, Req 15).
 *
 * Lists every employee for the connected admin's treasury with
 * `EmployeesTable`, and exposes `AddEmployeeDialog` for new registrations.
 * Backend rows are fetched alongside on-chain data so the Edit dialog can
 * pre-fill name / email.
 */
import { useQuery } from "@tanstack/react-query";

import { AddEmployeeDialog } from "@/components/employees/AddEmployeeDialog";
import { EmployeesTable } from "@/components/employees/EmployeesTable";
import type { BackendEmployee } from "@/components/employees/EmployeesTable";
import { useEmployees } from "@/hooks/useEmployees";
import { useTreasury } from "@/hooks/useTreasury";

/** Minimal backend Treasury shape needed to resolve the cuid. */
interface BackendTreasury {
  id: string;
  onchainAddress: string;
}

export default function EmployeesPage() {
  const { treasuryPda, isLoading: treasuryLoading } = useTreasury();
  const { data: employees, isLoading: employeesLoading } =
    useEmployees(treasuryPda);

  // Resolve the backend treasury id by matching the on-chain PDA address.
  // GET /api/treasury is public — no auth needed.
  const treasuryPdaStr = treasuryPda?.toBase58() ?? null;
  const { data: backendTreasuryId } = useQuery<string | null>({
    queryKey: ["backendTreasuryId", treasuryPdaStr],
    queryFn: async () => {
      if (!treasuryPdaStr) return null;
      const baseUrl =
        process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3000";
      const res = await fetch(`${baseUrl}/api/treasury`);
      if (!res.ok) return null;
      const data = (await res.json()) as { treasuries: BackendTreasury[] };
      const match = data.treasuries.find(
        (t) => t.onchainAddress === treasuryPdaStr,
      );
      return match?.id ?? null;
    },
    staleTime: 60_000,
    enabled: !!treasuryPdaStr,
  });

  // Fetch backend employee rows (name / email) for the Edit dialog pre-fill.
  const { data: backendData } = useQuery<{ employees: BackendEmployee[] }>({
    queryKey: ["backendEmployees", backendTreasuryId ?? null],
    queryFn: async () => {
      if (!backendTreasuryId) return { employees: [] };
      const baseUrl =
        process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3000";
      const res = await fetch(
        `${baseUrl}/api/employees?treasuryId=${backendTreasuryId}`,
      );
      if (!res.ok) return { employees: [] };
      return res.json() as Promise<{ employees: BackendEmployee[] }>;
    },
    staleTime: 30_000,
    enabled: !!backendTreasuryId,
  });

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-foreground">Employees</h1>
        {treasuryPda !== null ? (
          <AddEmployeeDialog
            treasuryPda={treasuryPda}
            treasuryBackendId={backendTreasuryId ?? undefined}
          />
        ) : null}
      </div>

      <EmployeesTable
        employees={employees}
        isLoading={treasuryLoading || employeesLoading}
        treasuryPda={treasuryPda}
        backendEmployees={backendData?.employees}
      />
    </main>
  );
}
