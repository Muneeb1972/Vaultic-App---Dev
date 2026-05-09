"use client";

/**
 * Employee portal home (Task 27.1, Req 18.1–18.2).
 *
 * Already guarded by `app/portal/layout.tsx` — if we render here, the
 * caller is an employee. The page shows:
 *   1. Profile card (role, chain, wallet, target address, active badge)
 *   2. Vesting progress (percentage, timeline, allocation totals)
 *   3. Reveal salary card (DecryptSalaryButton — privacy-critical,
 *      state-only display per Req 5.4)
 *   4. CTA link to `/portal/claim`
 *
 * Loading and empty states are handled inline so the page behaves well
 * when the employee record is still resolving, or in the edge case where
 * the role check passed but the record was just terminated.
 */
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DecryptSalaryButton } from "@/components/portal/DecryptSalaryButton";
import { EmployeeProfileCard } from "@/components/portal/EmployeeProfileCard";
import { VestingProgress } from "@/components/portal/VestingProgress";
import { useMyEmployee } from "@/hooks/useMyEmployee";

export default function PortalHome() {
  const { employee, employeePda, treasuryPda, isLoading } = useMyEmployee();

  if (isLoading) {
    return (
      <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </main>
    );
  }

  if (!employee || !employeePda || !treasuryPda) {
    return (
      <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        <h1 className="text-3xl font-semibold text-foreground">My Vaultic</h1>
        <Card>
          <CardHeader>
            <CardTitle>No employee record</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              This wallet has no active `EmployeeRecord` bound to it. If you
              were recently terminated the record persists on-chain but is
              inactive — contact your treasury admin.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-foreground">My Vaultic</h1>
      </div>

      <EmployeeProfileCard employee={employee} />

      <VestingProgress employee={employee} />

      <Card>
        <CardHeader>
          <CardTitle>Salary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Your salary is stored as FHE ciphertext on-chain. Revealing
            decrypts it through the Encrypt protocol and returns the
            plaintext via transaction return-data — the only path the
            plaintext ever leaves the chain. The value is shown once in
            this session only and is never persisted anywhere.
          </p>
          <DecryptSalaryButton
            employee={employee}
            employeePda={employeePda}
            treasuryPda={treasuryPda}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Claims</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-muted-foreground">
            Submit a claim against your vested balance. Approved claims are
            signed by the treasury's Ika dWallet and broadcast to your
            preferred chain — no bridges involved.
          </p>
          <Button asChild>
            <Link href="/portal/claim">Submit a claim</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
