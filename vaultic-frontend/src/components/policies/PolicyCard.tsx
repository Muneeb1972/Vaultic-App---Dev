"use client";

/**
 * PolicyCard — render a single `PolicyAccount` in the list view
 * (Task 26.4, Req 17.1).
 *
 * Shows every invariant admin users care about:
 *   - `policy_id` and `is_active` badge
 *   - `spending_limit` (in SOL)
 *   - `time_lock` (in hours)
 *   - `required_approvers` / `non_zero_approver_count`
 *   - shortened approver wallets
 *
 * The "Deactivate" button is a placeholder — there's no on-chain
 * `deactivate_policy` instruction today (design §3.1.1.15 documents
 * `is_active` as authority-mutable via `update_policy`, which isn't
 * implemented yet). We surface the CTA to make the intent explicit.
 */
import { PublicKey } from "@solana/web3.js";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PolicyEntry } from "@/hooks/usePolicies";
import {
  formatDuration,
  formatLamportsSol,
  shortenAddress,
} from "@/lib/format";
import { cn } from "@/lib/utils";

/** Count approvers that aren't the zero pubkey. */
function nonZeroApproverCount(approvers: PublicKey[]): number {
  return approvers.filter((k) => !k.equals(PublicKey.default)).length;
}

export interface PolicyCardProps {
  entry: PolicyEntry;
}

export function PolicyCard({ entry }: PolicyCardProps) {
  const { account } = entry;
  const approvers = account.approvers as PublicKey[];
  const nonZero = nonZeroApproverCount(approvers);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">
          Policy #{account.policyId.toString()}
        </CardTitle>
        <span
          className={cn(
            "rounded-md border px-2 py-0.5 text-xs font-medium",
            account.isActive
              ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
              : "border-red-500/30 bg-red-500/15 text-red-400",
          )}
        >
          {account.isActive ? "Active" : "Inactive"}
        </span>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Spending Limit</p>
            <p className="font-medium text-foreground">
              {formatLamportsSol(account.spendingLimit)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Time Lock</p>
            <p className="font-medium text-foreground">
              {account.timeLock.toNumber() === 0
                ? "None"
                : formatDuration(account.timeLock.toNumber())}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Approvers</p>
            <p className="font-medium text-foreground">
              {account.requiredApprovers} / {nonZero}
            </p>
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs text-muted-foreground">
            Approver wallets
          </p>
          <div className="flex flex-wrap gap-2">
            {approvers
              .filter((k) => !k.equals(PublicKey.default))
              .map((key) => (
                <span
                  key={key.toBase58()}
                  className="rounded-md border border-border/60 bg-secondary/50 px-2 py-1 font-mono text-xs"
                >
                  {shortenAddress(key, 4)}
                </span>
              ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
