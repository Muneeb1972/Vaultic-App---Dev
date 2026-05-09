"use client";

/**
 * ApproveTransactionButton — per-proposal CTA invoking `approve_transaction`
 * (Task 26.4).
 *
 * Disabled conditions:
 *   - the connected wallet is not in the policy's approver allowlist
 *   - the time-lock has not elapsed
 *   - the proposal is already executed
 *   - this approver has already signed
 *
 * When the time-lock isn't elapsed we still render the button with a tooltip-
 * style label showing the remaining countdown (Task 26 spec calls this "polish",
 * lowest priority — we implement the static case here and skip live countdown
 * updates at the button level).
 */
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { PolicyEntry, ProposalEntry } from "@/hooks/usePolicies";
import { useVaulticProgram } from "@/lib/anchor";
import { humanizeError } from "@/lib/errorMessages";
import { explorerTxUrl, formatDuration } from "@/lib/format";

export interface ApproveTransactionButtonProps {
  proposal: ProposalEntry;
  policy: PolicyEntry | undefined;
  treasuryPda: PublicKey;
}

export function ApproveTransactionButton({
  proposal,
  policy,
  treasuryPda,
}: ApproveTransactionButtonProps) {
  const program = useVaulticProgram();
  const { publicKey } = useWallet();
  const queryClient = useQueryClient();

  const nowSecs = Math.floor(Date.now() / 1000);
  const proposedAt = proposal.account.proposedAt.toNumber();
  const timeLock = policy?.account.timeLock.toNumber() ?? 0;
  const elapsed = nowSecs - proposedAt;
  const remaining = Math.max(0, timeLock - elapsed);
  const timeLockElapsed = remaining === 0;

  // Approver index lookup — the instruction needs it implicitly via the
  // signing wallet, but we precompute for UI gating.
  const approverIndex =
    policy && publicKey
      ? (policy.account.approvers as PublicKey[]).findIndex((k) =>
          k.equals(publicKey),
        )
      : -1;
  const isApprover = approverIndex >= 0;
  const alreadySigned =
    approverIndex >= 0
      ? (proposal.account.approversSigned[approverIndex] ?? false)
      : false;

  const disabled =
    !isApprover ||
    !timeLockElapsed ||
    proposal.account.executed ||
    alreadySigned;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!program) throw new Error("Wallet is not connected");
      return program.methods
        .approveTransaction()
        .accountsPartial({
          proposal: proposal.publicKey,
        })
        .rpc();
    },
    onSuccess: (signature) => {
      toast.success("Proposal approved", {
        description: (
          <a
            href={explorerTxUrl(signature)}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            View transaction
          </a>
        ),
      });
      queryClient.invalidateQueries({
        queryKey: ["proposals", treasuryPda.toBase58()],
      });
    },
    onError: (err) => {
      toast.error("Approval failed", { description: humanizeError(err) });
    },
  });

  // Build a precise tooltip / label for the disabled reason so admins
  // know why the button is inert. We prefer a visible label over silent
  // disablement.
  let label = "Approve";
  if (proposal.account.executed) label = "Executed";
  else if (!isApprover) label = "Not an approver";
  else if (alreadySigned) label = "Signed";
  else if (!timeLockElapsed) label = `Unlocks in ${formatDuration(remaining)}`;

  return (
    <Button
      size="sm"
      variant={disabled ? "outline" : "default"}
      disabled={disabled || mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      {mutation.isPending ? "Signing..." : label}
    </Button>
  );
}
