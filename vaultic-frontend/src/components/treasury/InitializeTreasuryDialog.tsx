"use client";

/**
 * InitializeTreasuryDialog — shadcn Dialog + react-hook-form for
 * `initialize_treasury` (Req 1.1–1.3).
 *
 * Rendered from the landing page when a connected wallet has no role
 * yet (`unknown`). Creating the TreasuryConfig PDA promotes the wallet
 * to `admin` on the next `useRole` refetch, which triggers the
 * auto-redirect in `LandingHero` → `/dashboard`.
 *
 * Inputs:
 *   - `name` (≤ 64 chars, enforced on-chain)
 *   - `payrollInterval` (hours → seconds)
 *   - `spendingLimitPerTx` (SOL → lamports)
 *   - `requiredApprovers` (0–5, enforced on-chain)
 *
 * `dwallet_id` is passed as `PublicKey.default` at init time — the
 * dWallet is bound later via `create_dwallet` (Req 6).
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
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
import { findTreasuryPda } from "@/lib/pda";
import { signedFetch } from "@/lib/signedFetch";

const formSchema = z.object({
  name: z.string().min(1, "Required").max(64, "Max 64 characters"),
  payrollIntervalHours: z.coerce.number().int().positive(),
  spendingLimitSol: z.coerce.number().nonnegative(),
  requiredApprovers: z.coerce.number().int().min(0).max(5),
});

type FormValues = z.infer<typeof formSchema>;

export function InitializeTreasuryDialog() {
  const [open, setOpen] = useState(false);
  const { publicKey } = useWallet();
  const program = useVaulticProgram();
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "My DAO Treasury",
      payrollIntervalHours: 24,
      spendingLimitSol: 100,
      requiredApprovers: 1,
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!program || !publicKey) throw new Error("Wallet is not connected");

      const [treasuryPda] = findTreasuryPda(publicKey, program.programId);

      const payrollInterval = new BN(values.payrollIntervalHours * 3600);
      const spendingLimit = new BN(
        Math.floor(values.spendingLimitSol * 1e9),
      );

      const signature = await program.methods
        .initializeTreasury(
          values.name,
          payrollInterval,
          spendingLimit,
          values.requiredApprovers,
          PublicKey.default,
        )
        .accountsPartial({
          authority: publicKey,
          treasury: treasuryPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Mirror treasury to backend so employee inserts can reference it.
      try {
        await signedFetch(wallet, "POST", "/api/treasury", {
          onchainAddress: treasuryPda.toBase58(),
          authorityWallet: publicKey.toBase58(),
          name: values.name,
        });
      } catch (backendErr) {
        // Non-fatal — on-chain is the source of truth.
        console.warn("[Vaultic] backend treasury mirror failed:", backendErr);
      }

      return signature;
    },
    onSuccess: (signature) => {
      toast.success("Treasury initialised", {
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
      // Invalidate the role query so LandingHero picks up the new
      // `admin` role and redirects to /dashboard.
      queryClient.invalidateQueries({ queryKey: ["role"] });
      form.reset();
      setOpen(false);
    },
    onError: (err) => {
      toast.error("Treasury creation failed", {
        description: humanizeError(err),
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg">Initialise Treasury</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Initialise your DAO treasury</DialogTitle>
          <DialogDescription>
            Creates the on-chain TreasuryConfig PDA bound to your wallet.
            Your wallet becomes the treasury authority and gains access to
            the admin dashboard.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Treasury name</FormLabel>
                  <FormControl>
                    <Input {...field} maxLength={64} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="payrollIntervalHours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payroll interval (hours)</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" min={1} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="spendingLimitSol"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Spending limit per tx (SOL)</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" step="0.001" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="requiredApprovers"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Required approvers (0–5)</FormLabel>
                  <FormControl>
                    <Input {...field} type="number" min={0} max={5} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Submitting..." : "Initialise"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
