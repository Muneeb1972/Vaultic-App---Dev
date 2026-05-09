"use client";

/**
 * ClaimsHistoryTable — decoded `ClaimRecord` PDAs for the connected
 * employee (Task 27.2, Req 18.5).
 *
 * Columns: status (Pending / IkaApproved / Executed / Failed), amount
 * (SOL), submitted timestamp. Anchor decodes the `ClaimStatus` enum as
 * `{ pending: {} } | { ikaApproved: {} } | ...` — we pick the first
 * present key to derive the label.
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
import type { ClaimEntry, ClaimRecordAccount } from "@/hooks/useMyClaims";
import { formatLamportsSol, formatUnixTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";

type ClaimStatusKey = "pending" | "ikaApproved" | "executed" | "failed";

/**
 * Read the first enum-variant key Anchor decodes into. The IDL's
 * `ClaimStatus` enum produces an object with exactly one key matching
 * the active variant.
 */
function statusKey(status: ClaimRecordAccount["status"]): ClaimStatusKey {
  const keys = Object.keys(status) as ClaimStatusKey[];
  return keys[0] ?? "pending";
}

const STATUS_LABELS: Record<ClaimStatusKey, string> = {
  pending: "Pending",
  ikaApproved: "Ika Approved",
  executed: "Executed",
  failed: "Failed",
};

const STATUS_STYLES: Record<ClaimStatusKey, string> = {
  pending: "border-amber-500/30 bg-amber-500/15 text-amber-400",
  ikaApproved: "border-sky-500/30 bg-sky-500/15 text-sky-400",
  executed: "border-emerald-500/30 bg-emerald-500/15 text-emerald-400",
  failed: "border-red-500/30 bg-red-500/15 text-red-400",
};

export interface ClaimsHistoryTableProps {
  claims: ClaimEntry[] | undefined;
  isLoading: boolean;
}

export function ClaimsHistoryTable({ claims, isLoading }: ClaimsHistoryTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Claim history</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : !claims || claims.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No claims submitted yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {claims.map((entry) => {
                const key = statusKey(entry.account.status);
                return (
                  <TableRow key={entry.publicKey.toBase58()}>
                    <TableCell>
                      <span
                        className={cn(
                          "rounded-md border px-2 py-0.5 text-xs font-medium",
                          STATUS_STYLES[key],
                        )}
                      >
                        {STATUS_LABELS[key]}
                      </span>
                    </TableCell>
                    <TableCell>
                      {formatLamportsSol(entry.account.amountClaimed)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatUnixTimestamp(entry.account.claimTimestamp)}
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
