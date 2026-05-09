"use client";

/**
 * PayrollHistoryTable — full history of payroll executions for the
 * treasury (Task 26.3, Req 16.5).
 *
 * Reuses the same status-extraction logic as `PayrollRunsList` but adds
 * `completed_at` and supports a larger page (50).
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
import type { PayrollRun } from "@/hooks/usePayrollRuns";
import { formatUnixTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";

type StatusKey = "pending" | "processing" | "completed" | "failed";

function extractStatus(status: unknown): StatusKey {
  if (typeof status !== "object" || status === null) return "pending";
  const key = Object.keys(status)[0]?.toLowerCase();
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

export interface PayrollHistoryTableProps {
  runs: PayrollRun[] | undefined;
  isLoading: boolean;
}

export function PayrollHistoryTable({
  runs,
  isLoading,
}: PayrollHistoryTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payroll History</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : !runs || runs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No payroll runs yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Execution ID</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Employees</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => {
                const status = extractStatus(run.account.status);
                return (
                  <TableRow key={run.publicKey.toBase58()}>
                    <TableCell className="font-mono">
                      {run.account.executionId.toString()}
                    </TableCell>
                    <TableCell>
                      {formatUnixTimestamp(run.account.startedAt)}
                    </TableCell>
                    <TableCell>
                      {formatUnixTimestamp(run.account.completedAt)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex rounded-md border px-2 py-0.5 text-xs font-medium",
                          STATUS_STYLES[status],
                        )}
                      >
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {run.account.employeesProcessed}
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
