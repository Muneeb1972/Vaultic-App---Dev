"use client";

/**
 * EmployeesTable — decoded `EmployeeRecord` PDAs in tabular form
 * (Task 26.2, Req 15.1).
 *
 * Columns: wallet (short) / role tier / chain / vesting % / active / actions.
 * The on-chain record doesn't store a display name — the backend's
 * `Employee` row does — so this MVP renders the shortened wallet as the
 * primary identifier. A follow-up task can join the backend list into
 * this table.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TerminateEmployeeButton } from "@/components/employees/TerminateEmployeeButton";
import type { EmployeeEntry } from "@/hooks/useEmployees";
import {
  chainLabel,
  roleLabel,
  shortenAddress,
  vestingProgressPct,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PublicKey } from "@solana/web3.js";

export interface EmployeesTableProps {
  employees: EmployeeEntry[] | undefined;
  isLoading: boolean;
  treasuryPda: PublicKey | null;
}

export function EmployeesTable({
  employees,
  isLoading,
  treasuryPda,
}: EmployeesTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Employees</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : !employees || employees.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No employees registered yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Wallet</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Chain</TableHead>
                <TableHead>Vesting</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((entry) => {
                const pct = vestingProgressPct(
                  entry.account.vestingStart,
                  entry.account.vestingDuration,
                );
                return (
                  <TableRow key={entry.publicKey.toBase58()}>
                    <TableCell className="font-mono text-xs">
                      {shortenAddress(entry.account.employeeWallet, 4)}
                    </TableCell>
                    <TableCell>{roleLabel(entry.account.roleId)}</TableCell>
                    <TableCell>
                      {chainLabel(entry.account.chainPreference)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-20 overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full bg-primary"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {pct}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "rounded-md border px-2 py-0.5 text-xs font-medium",
                          entry.account.isActive
                            ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
                            : "border-red-500/30 bg-red-500/15 text-red-400",
                        )}
                      >
                        {entry.account.isActive ? "Active" : "Terminated"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {entry.account.isActive && treasuryPda !== null ? (
                        <TerminateEmployeeButton
                          employeePda={entry.publicKey}
                          employeeWallet={entry.account.employeeWallet}
                          treasuryPda={treasuryPda}
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
