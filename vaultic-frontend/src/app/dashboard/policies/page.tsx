"use client";

/**
 * Policies page (Task 26.4, Req 17).
 *
 * Composes:
 *   - Grid of `PolicyCard`s (existing policies)
 *   - `CreatePolicyDialog`
 *   - `ProposeTransactionForm`
 *   - `TransactionProposalList` with per-row `ApproveTransactionButton`
 */
import { BN } from "@coral-xyz/anchor";

import { CreatePolicyDialog } from "@/components/policies/CreatePolicyDialog";
import { PolicyCard } from "@/components/policies/PolicyCard";
import { ProposeTransactionForm } from "@/components/policies/ProposeTransactionForm";
import { TransactionProposalList } from "@/components/policies/TransactionProposalList";
import { Skeleton } from "@/components/ui/skeleton";
import { usePolicies, useProposals } from "@/hooks/usePolicies";
import { useTreasury } from "@/hooks/useTreasury";

/** Next policy id = max(existing) + 1, else 0. */
function nextPolicyId(policies: { account: { policyId: BN } }[]): BN {
  if (policies.length === 0) return new BN(0);
  let max = new BN(0);
  for (const p of policies) {
    if (p.account.policyId.cmp(max) > 0) max = p.account.policyId;
  }
  return max.add(new BN(1));
}

export default function PoliciesPage() {
  const { treasuryPda, isLoading: treasuryLoading } = useTreasury();
  const { data: policies, isLoading: policiesLoading } =
    usePolicies(treasuryPda);
  const { data: proposals, isLoading: proposalsLoading } =
    useProposals(treasuryPda);

  const policyList = policies ?? [];
  const proposalList = proposals ?? [];

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-foreground">Policies</h1>
        {treasuryPda !== null ? (
          <CreatePolicyDialog
            treasuryPda={treasuryPda}
            nextPolicyId={nextPolicyId(policyList)}
          />
        ) : null}
      </div>

      {treasuryLoading || policiesLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : policyList.length === 0 ? (
        <p className="rounded-lg border border-border/60 bg-card/60 p-8 text-center text-sm text-muted-foreground">
          No policies yet. Create one to enable proposal approvals.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {policyList.map((entry) => (
            <PolicyCard key={entry.publicKey.toBase58()} entry={entry} />
          ))}
        </div>
      )}

      {treasuryPda && policyList.length > 0 ? (
        <ProposeTransactionForm
          treasuryPda={treasuryPda}
          policies={policyList}
          proposals={proposalList}
        />
      ) : null}

      {treasuryPda ? (
        <TransactionProposalList
          proposals={proposals}
          policies={policyList}
          isLoading={proposalsLoading}
          treasuryPda={treasuryPda}
        />
      ) : null}
    </main>
  );
}
