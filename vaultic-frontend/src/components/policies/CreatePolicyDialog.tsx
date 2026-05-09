"use client";

/**
 * CreatePolicyDialog — shadcn Dialog + react-hook-form for `create_policy`
 * (Task 26.4, Req 17.2).
 *
 * Inputs:
 *   - `spending_limit` (SOL → lamports BN)
 *   - `time_lock` (hours → seconds)
 *   - `required_approvers` (1–5)
 *   - up to 5 approver wallet inputs (base58)
 *
 * The `policy_id` is auto-assigned from `existingPolicies.length` — the
 * on-chain PDA requires a unique id, so we bump past the last policy
 * we've observed. A collision retries with `id + 1` are left for a future
 * task; most admins create policies one at a time so contention is
 * unlikely.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useVaulticProgram } from "@/lib/anchor";
import { humanizeError } from "@/lib/errorMessages";
import { explorerTxUrl } from "@/lib/format";
import { findPolicyPda } from "@/lib/pda";

const pubkeyOrEmpty = z
  .string()
  .refine(
    (v) => {
      if (v === "") return true;
      try {
        new PublicKey(v);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Invalid base58 public key" },
  );

const formSchema = z.object({
  spendingLimitSol: z.coerce.number().nonnegative(),
  timeLockHours: z.coerce.number().nonnegative(),
  requiredApprovers: z.coerce.number().int().min(1).max(5),
  approver1: pubkeyOrEmpty,
  approver2: pubkeyOrEmpty,
  approver3: pubkeyOrEmpty,
  approver4: pubkeyOrEmpty,
  approver5: pubkeyOrEmpty,
});

type FormValues = z.infer<typeof formSchema>;

export interface CreatePolicyDialogProps {
  treasuryPda: PublicKey;
  nextPolicyId: BN;
}

export function CreatePolicyDialog({
  treasuryPda,
  nextPolicyId,
}: CreatePolicyDialogProps) {
  const [open, setOpen] = useState(false);
  const program = useVaulticProgram();
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      spendingLimitSol: 0,
      timeLockHours: 0,
      requiredApprovers: 1,
      approver1: "",
      approver2: "",
      approver3: "",
      approver4: "",
      approver5: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!program) throw new Error("Wallet is not connected");

      const approverStrings = [
        values.approver1,
        values.approver2,
        values.approver3,
        values.approver4,
        values.approver5,
      ];
      const approvers = approverStrings.map((s) =>
        s === "" ? PublicKey.default : new PublicKey(s),
      );
      const nonZeroCount = approvers.filter(
        (k) => !k.equals(PublicKey.default),
      ).length;
      if (nonZeroCount < values.requiredApprovers) {
        throw new Error(
          "Required approvers cannot exceed the number of filled-in approvers",
        );
      }

      const [policyPda] = findPolicyPda(
        treasuryPda,
        nextPolicyId,
        program.programId,
      );

      const spendingLimit = new BN(Math.floor(values.spendingLimitSol * 1e9));
      const timeLock = new BN(values.timeLockHours * 3600);

      return program.methods
        .createPolicy(
          nextPolicyId,
          spendingLimit,
          timeLock,
          values.requiredApprovers,
          approvers as unknown as [
            PublicKey,
            PublicKey,
            PublicKey,
            PublicKey,
            PublicKey,
          ],
        )
        .accountsPartial({
          treasury: treasuryPda,
          policy: policyPda,
        })
        .rpc();
    },
    onSuccess: (signature) => {
      toast.success("Policy created", {
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
        queryKey: ["policies", treasuryPda.toBase58()],
      });
      form.reset();
      setOpen(false);
    },
    onError: (err) => {
      toast.error("Policy creation failed", {
        description: humanizeError(err),
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Create Policy</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create spending policy</DialogTitle>
          <DialogDescription>
            Policy #{nextPolicyId.toString()} governs proposed transactions
            up to the spending limit, subject to approver signatures and an
            optional time-lock.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="spendingLimitSol"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Spending limit (SOL)</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" step="0.001" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="timeLockHours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time lock (hours)</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" step="1" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="requiredApprovers"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Required approvers</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" min={1} max={5} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Approver wallets (up to 5)
              </p>
              {(
                [
                  "approver1",
                  "approver2",
                  "approver3",
                  "approver4",
                  "approver5",
                ] as const
              ).map((name, idx) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Approver {idx + 1}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          className="font-mono"
                          placeholder="Base58 wallet (optional)"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
