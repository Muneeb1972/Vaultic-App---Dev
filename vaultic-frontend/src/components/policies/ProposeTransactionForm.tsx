"use client";

/**
 * ProposeTransactionForm — inline form to invoke `propose_transaction`
 * (Task 26.4).
 *
 * Required inputs:
 *   - Policy (select from `existingPolicies`)
 *   - Nonce (auto-incremented from the current max proposal nonce + 1)
 *   - Amount (SOL → lamports BN)
 *   - Target (base58 wallet)
 *
 * The nonce auto-increment is best-effort — if two proposals go in
 * concurrently the later one fails with `AccountAlreadyInUse` and the
 * user can retry. Same trade-off as the policy-id assignment.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { PolicyEntry, ProposalEntry } from "@/hooks/usePolicies";
import { useVaulticProgram } from "@/lib/anchor";
import { humanizeError } from "@/lib/errorMessages";
import { explorerTxUrl } from "@/lib/format";
import { findProposalPda } from "@/lib/pda";

const schema = z.object({
  policyPda: z.string().min(1, "Select a policy"),
  amountSol: z.coerce.number().nonnegative(),
  targetWallet: z
    .string()
    .min(32, "Invalid wallet")
    .refine(
      (v) => {
        try {
          new PublicKey(v);
          return true;
        } catch {
          return false;
        }
      },
      { message: "Invalid base58 public key" },
    ),
});

type FormValues = z.infer<typeof schema>;

export interface ProposeTransactionFormProps {
  treasuryPda: PublicKey;
  policies: PolicyEntry[];
  proposals: ProposalEntry[];
}

/** Next nonce = max(existing nonces) + 1, or 0 when none exist. */
function nextNonce(proposals: ProposalEntry[]): BN {
  if (proposals.length === 0) return new BN(0);
  let max = new BN(0);
  for (const p of proposals) {
    if (p.account.nonce.cmp(max) > 0) max = p.account.nonce;
  }
  return max.add(new BN(1));
}

export function ProposeTransactionForm({
  treasuryPda,
  policies,
  proposals,
}: ProposeTransactionFormProps) {
  const program = useVaulticProgram();
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      policyPda: policies[0]?.publicKey.toBase58() ?? "",
      amountSol: 0,
      targetWallet: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!program) throw new Error("Wallet is not connected");
      const policyPda = new PublicKey(values.policyPda);
      const target = new PublicKey(values.targetWallet);
      const amount = new BN(Math.floor(values.amountSol * 1e9));
      const nonce = nextNonce(proposals);

      const [proposalPda] = findProposalPda(
        treasuryPda,
        nonce,
        program.programId,
      );

      return program.methods
        .proposeTransaction(nonce, amount, target)
        .accountsPartial({
          policy: policyPda,
          proposal: proposalPda,
        })
        .rpc();
    },
    onSuccess: (signature, variables) => {
      toast.success("Proposal submitted", {
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
      form.reset({
        policyPda: variables.policyPda,
        amountSol: 0,
        targetWallet: "",
      } as FormValues);
    },
    onError: (err) => {
      toast.error("Proposal failed", { description: humanizeError(err) });
    },
  });

  // Don't render if there are no policies to bind the proposal to.
  if (policies.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Propose Transaction</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="grid grid-cols-1 gap-4 md:grid-cols-4"
          >
            <FormField
              control={form.control}
              name="policyPda"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Policy</FormLabel>
                  <FormControl>
                    <select
                      {...field}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                    >
                      {policies.map((p) => (
                        <option
                          key={p.publicKey.toBase58()}
                          value={p.publicKey.toBase58()}
                        >
                          Policy #{p.account.policyId.toString()}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="amountSol"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount (SOL)</FormLabel>
                  <FormControl>
                    <Input {...field} type="number" step="0.001" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="targetWallet"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Target wallet</FormLabel>
                  <FormControl>
                    <Input {...field} className="font-mono" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex items-end">
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Submitting..." : "Propose"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
