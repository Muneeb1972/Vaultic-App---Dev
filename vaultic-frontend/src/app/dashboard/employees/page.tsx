"use client";

/**
 * Employees page (Task 26.2, Req 15).
 *
 * Lists every employee for the connected admin's treasury with
 * `EmployeesTable`, and exposes `AddEmployeeDialog` for new registrations.
 */
import { AddEmployeeDialog } from "@/components/employees/AddEmployeeDialog";
import { EmployeesTable } from "@/components/employees/EmployeesTable";
import { useEmployees } from "@/hooks/useEmployees";
import { useTreasury } from "@/hooks/useTreasury";

export default function EmployeesPage() {
  const { treasuryPda, isLoading: treasuryLoading } = useTreasury();
  const { data: employees, isLoading: employeesLoading } =
    useEmployees(treasuryPda);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-foreground">Employees</h1>
        {treasuryPda !== null ? (
          <AddEmployeeDialog treasuryPda={treasuryPda} />
        ) : null}
      </div>

      <EmployeesTable
        employees={employees}
        isLoading={treasuryLoading || employeesLoading}
        treasuryPda={treasuryPda}
      />
    </main>
  );
}
