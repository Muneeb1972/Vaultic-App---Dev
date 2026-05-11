"use client";

/**
 * EmployeesTable — decoded `EmployeeRecord` PDAs in tabular form
 * (Task 26.2, Req 15.1).
 *
 * Columns: wallet (short) / role tier / chain / vesting % / active / actions.
 * The on-chain record doesn't store a display name — the backend's
 * `Employee` row does — so this MVP renders the shortened wallet as the
 * primary identifier. Backend rows are joined by `walletAddress` to
 * pre-fill the Edit dialog with name / email.
 */
import { useState } from "react";
import { Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EditEmployeeDialog } from "@/components/employees/EditEmployeeDialog";
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

/** Minimal shape of a backend Employee row needed for the Edit dialog. */
export interface BackendEmployee {
  id: string;
  walletAddress: string;
  name: string;
  email?: string | null;
  salarySol?: string | null;
  bonusSol?: string | null;
  performanceSol?: string | null;
  roleId?: number | null;
  chainPreference?: number | null;
  targetAddressHex?: string | null;
  totalAllocationSol?: string | null;
  vestingStart?: string | null;
  vestingCliffDays?: number | null;
  vestingDurationDays?: number | null;
}

export interface EmployeesTableProps {
  employees: EmployeeEntry[] | undefined;
  isLoading: boolean;
  treasuryPda: PublicKey | null;
  /** Optional backend rows — joined by walletAddress to pre-fill Edit dialog. */
  backendEmployees?: BackendEmployee[];
}

export function EmployeesTable({
  employees,
  isLoading,
  treasuryPda,
  backendEmployees = [],
}: EmployeesTableProps) {
  // Build a lookup map: walletAddress → backend row
  const backendByWallet = new Map<string, BackendEmployee>(
    backendEmployees.map((e) => [e.walletAddress, e]),
  );

  // Track which employee's edit dialog is open by their PDA string.
  const [editOpenPda, setEditOpenPda] = useState<string | null>(null);
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
                const walletStr = entry.account.employeeWallet.toBase58();
                const backend = backendByWallet.get(walletStr);
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
                      <div className="flex items-center justify-end gap-2">
                        {treasuryPda !== null && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditOpenPda(entry.publicKey.toBase58())}
                              className="rounded-xl"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </Button>
                            <EditEmployeeDialog
                              entry={entry}
                              backend={backend}
                              treasuryPda={treasuryPda}
                              open={editOpenPda === entry.publicKey.toBase58()}
                              onOpenChange={(v) =>
                                setEditOpenPda(v ? entry.publicKey.toBase58() : null)
                              }
                            />
                          </>
                        )}
                        {entry.account.isActive && treasuryPda !== null ? (
                          <TerminateEmployeeButton
                            employeePda={entry.publicKey}
                            employeeWallet={entry.account.employeeWallet}
                            treasuryPda={treasuryPda}
                          />
                        ) : null}
                      </div>
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
