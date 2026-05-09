"use client";

/**
 * PayrollRunsList — recent `PayrollExecution` PDAs for the treasury
 * (Task 26.1, Req 14.3–14.4).
 *
 * Status values are a discriminated enum on-chain; Anchor decodes them as
 * `{ pending: {} } | { processing: {} } | { completed: {} } | { failed: {} }`.
 * We detect which key is present and map it to a human-readable badge.
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
import { formatUnixTimestamp } from "@/lib/format";
import type { PayrollRun } from "@/hooks/usePayrollRuns";
import { cn } from "@/lib/utils";

export interface PayrollRunsListProps {
  runs: PayrollRun[] | undefined;
  isLoading: boolean;
  limit?: number;
}

type StatusKey = "pending" | "processing" | "completed" | "failed";

/** Extract the active variant key from an Anchor-decoded enum. */
function extractStatus(status: unknown): StatusKey {
  if (typeof status !== "object" || status === null) return "pending";
  const keys = Object.keys(status);
  const key = keys[0]?.toLowerCase();
  if (
    key === "pending" ||
    key === "processing" ||
    key === "completed" ||
    key === "failed"
  ) {
    return key;
  }
  return "pending";
}

const STATUS_STYLES: Record<StatusKey, string> = {
  pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  processing: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  failed: "bg-red-500/15 text-red-400 border-red-500/30",
};

function StatusBadge({ status }: { status: StatusKey }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span
      className={cn(
        "inline-flex rounded-md border px-2 py-0.5 text-xs font-medium",
        STATUS_STYLES[status],
      )}
    >
      {label}
    </span>
  );
}

export function PayrollRunsList({
  runs,
  isLoading,
  limit = 10,
}: PayrollRunsListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Payroll Runs</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : !runs || runs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No payroll runs yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Execution ID</TableHead>
                <TableHead>Started</TableHead>
                <TableHead className="text-right">Employees</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.slice(0, limit).map((run) => (
                <TableRow key={run.publicKey.toBase58()}>
                  <TableCell>
                    <StatusBadge status={extractStatus(run.account.status)} />
                  </TableCell>
                  <TableCell className="font-mono">
                    {run.account.executionId.toString()}
                  </TableCell>
                  <TableCell>
                    {formatUnixTimestamp(run.account.startedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    {run.account.employeesProcessed}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
