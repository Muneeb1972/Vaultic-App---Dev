"use client";

/**
 * Employee claim page (Task 27.2, Req 18.3–18.5).
 *
 * Already guarded by `app/portal/layout.tsx`. Layout: ClaimForm at the
 * top, ClaimsHistoryTable below. Both depend on the resolved employee
 * record, so we render a skeleton while `useMyEmployee` is in flight
 * and an empty state when no record is bound to the wallet.
 */
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ClaimForm } from "@/components/portal/ClaimForm";
import { ClaimsHistoryTable } from "@/components/portal/ClaimsHistoryTable";
import { useMyClaims } from "@/hooks/useMyClaims";
import { useMyEmployee } from "@/hooks/useMyEmployee";

export default function ClaimPage() {
  const {
    employee,
    employeePda,
    treasuryPda,
    isLoading: employeeLoading,
  } = useMyEmployee();
  const { data: claims, isLoading: claimsLoading } = useMyClaims();

  if (employeeLoading) {
    return (
      <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </main>
    );
  }

  if (!employee || !employeePda || !treasuryPda) {
    return (
      <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        <h1 className="text-3xl font-semibold text-foreground">Submit Claim</h1>
        <Card>
          <CardHeader>
            <CardTitle>No employee record</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              This wallet has no `EmployeeRecord` bound to it.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-foreground">Submit Claim</h1>
        <Button asChild variant="outline">
          <Link href="/portal">Back to portal</Link>
        </Button>
      </div>

      <ClaimForm
        employee={employee}
        employeePda={employeePda}
        treasuryPda={treasuryPda}
      />

      <ClaimsHistoryTable claims={claims} isLoading={claimsLoading} />
    </main>
  );
}
