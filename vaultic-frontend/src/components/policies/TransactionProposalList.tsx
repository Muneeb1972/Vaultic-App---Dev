"use client";

/**
 * TransactionProposalList — every open proposal for a treasury (Task 26.4).
 *
 * Columns: nonce / amount / target / proposed_at / approvals / time-lock
 * remaining / executed badge / approve action.
 *
 * The policy lookup is a client-side join: each proposal carries a
 * `policy: Pubkey` reference, and we match it to the pre-fetched
 * `usePolicies` result so we can show the approver allowlist and
 * time-lock. Proposals whose policy isn't in the current list render
 * with fallback metadata.
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
import type { PolicyEntry, ProposalEntry } from "@/hooks/usePolicies";
import {
  formatDuration,
  formatLamportsSol,
  formatUnixTimestamp,
  shortenAddress,
} from "@/lib/format";
import { ApproveTransactionButton } from "@/components/policies/ApproveTransactionButton";
import { cn } from "@/lib/utils";
import type { PublicKey } from "@solana/web3.js";

export interface TransactionProposalListProps {
  proposals: ProposalEntry[] | undefined;
  policies: PolicyEntry[];
  isLoading: boolean;
  treasuryPda: PublicKey;
}

export function TransactionProposalList({
  proposals,
  policies,
  isLoading,
  treasuryPda,
}: TransactionProposalListProps) {
  const nowSecs = Math.floor(Date.now() / 1000);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transaction Proposals</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : !proposals || proposals.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No proposals yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nonce</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Proposed</TableHead>
                <TableHead>Approvals</TableHead>
                <TableHead>Time Lock</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {proposals.map((p) => {
                const policy = policies.find((pol) =>
                  pol.publicKey.equals(p.account.policy),
                );
                const timeLock = policy?.account.timeLock.toNumber() ?? 0;
                const remaining = Math.max(
                  0,
                  timeLock - (nowSecs - p.account.proposedAt.toNumber()),
                );

                return (
                  <TableRow key={p.publicKey.toBase58()}>
                    <TableCell className="font-mono">
                      {p.account.nonce.toString()}
                    </TableCell>
                    <TableCell>{formatLamportsSol(p.account.amount)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {shortenAddress(p.account.target)}
                    </TableCell>
                    <TableCell>
                      {formatUnixTimestamp(p.account.proposedAt)}
                    </TableCell>
                    <TableCell>
                      {p.account.approvalCount} /{" "}
                      {policy?.account.requiredApprovers ?? "?"}
                    </TableCell>
                    <TableCell>
                      {timeLock === 0
                        ? "None"
                        : remaining === 0
                          ? "Elapsed"
                          : formatDuration(remaining)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "rounded-md border px-2 py-0.5 text-xs font-medium",
                          p.account.executed
                            ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
                            : "border-yellow-500/30 bg-yellow-500/15 text-yellow-400",
                        )}
                      >
                        {p.account.executed ? "Executed" : "Pending"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <ApproveTransactionButton
                        proposal={p}
                        policy={policy}
                        treasuryPda={treasuryPda}
                      />
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
