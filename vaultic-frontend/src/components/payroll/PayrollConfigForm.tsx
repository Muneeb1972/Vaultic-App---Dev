"use client";

/**
 * PayrollConfigForm — plaintext-first payroll configuration.
 *
 * Submits three sequential transactions to configure the PayrollConfig PDA:
 *   1. `set_payroll_band_mins` — five role-tier salary band minimums
 *   2. `set_payroll_band_maxs` — five role-tier salary band maximums
 *   3. `set_payroll_threshold` — performance threshold + bonus multiplier
 *
 * The three-transaction split is required by Solana's 1232-byte transaction
 * limit (design §3.1.2, Task 8.5). All three are submitted in sequence with
 * a single user-visible "Saving payroll config…" phase.
 *
 * encrypt-integration Req 1.2, Req 1.6–1.7, Req 9.1–9.5, Req 9.11–9.12
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { humanizeError } from "@/lib/errorMessages";
import { explorerTxUrl } from "@/lib/format";
import {
  buildSetPayrollBandMinsTx,
  buildSetPayrollBandMaxsTx,
  buildSetPayrollThresholdTx,
} from "@/lib/encrypt/txBuilder";
import { classifyError, errorMessage } from "@/lib/encrypt/errorClassifier";
import { useEnsureDeposit } from "@/hooks/useEnsureDeposit";
import type { EncryptPhase } from "@/lib/encrypt/types";
import type { PublicKey as PublicKeyType } from "@solana/web3.js";

// ── Validation ────────────────────────────────────────────────────────────

const U64_MAX = 18_446_744_073_709_551_615n;

const plaintextSolAmount = z
  .string()
  .min(1, "Required")
  .refine((v) => !isNaN(Number(v)) && Number(v) >= 0, {
    message: "Must be a non-negative number (Req 1.6)",
  })
  .refine(
    (v) => {
      try {
        const lamports = BigInt(Math.round(Number(v) * 1e9));
        return lamports >= 0n && lamports <= U64_MAX;
      } catch {
        return false;
      }
    },
    { message: "Value exceeds maximum u64 lamports (Req 1.7)" },
  );

const ROLE_TIERS = ["Junior", "Mid", "Senior", "Lead", "Executive"] as const;

const formSchema = z.object({
  // Five band_min values (one per role tier).
  bandMin0: plaintextSolAmount,
  bandMin1: plaintextSolAmount,
  bandMin2: plaintextSolAmount,
  bandMin3: plaintextSolAmount,
  bandMin4: plaintextSolAmount,
  // Five band_max values (one per role tier).
  bandMax0: plaintextSolAmount,
  bandMax1: plaintextSolAmount,
  bandMax2: plaintextSolAmount,
  bandMax3: plaintextSolAmount,
  bandMax4: plaintextSolAmount,
  // Performance threshold.
  performanceThreshold: plaintextSolAmount,
  // Bonus multiplier in basis points (u16, 0–10000).
  bonusMultiplierBps: z.coerce
    .number()
    .int()
    .min(0, "Must be ≥ 0")
    .max(10000, "Must be ≤ 10000 (100%)"),
});

type FormValues = z.infer<typeof formSchema>;

export interface PayrollConfigFormProps {
  treasuryPda: PublicKeyType;
}

export function PayrollConfigForm({ treasuryPda }: PayrollConfigFormProps) {
  const [encryptPhase, setEncryptPhase] = useState<EncryptPhase>({ kind: "Idle" });
  const { connection } = useConnection();
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const { ensureDeposit } = useEnsureDeposit();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      bandMin0: "", bandMin1: "", bandMin2: "", bandMin3: "", bandMin4: "",
      bandMax0: "", bandMax1: "", bandMax2: "", bandMax3: "", bandMax4: "",
      performanceThreshold: "",
      bonusMultiplierBps: 1000,
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!wallet.publicKey) throw new Error("Wallet is not connected");

      // Step 1: Ensure deposit.
      setEncryptPhase({ kind: "EnsureDeposit" });
      await ensureDeposit();

      setEncryptPhase({ kind: "Submitting", label: "Saving payroll config…" });

      const toLamports = (sol: string) =>
        BigInt(Math.round(Number(sol) * 1e9));

      const bandMinPlaintexts: [bigint, bigint, bigint, bigint, bigint] = [
        toLamports(values.bandMin0),
        toLamports(values.bandMin1),
        toLamports(values.bandMin2),
        toLamports(values.bandMin3),
        toLamports(values.bandMin4),
      ];
      const bandMaxPlaintexts: [bigint, bigint, bigint, bigint, bigint] = [
        toLamports(values.bandMax0),
        toLamports(values.bandMax1),
        toLamports(values.bandMax2),
        toLamports(values.bandMax3),
        toLamports(values.bandMax4),
      ];

      // Tx 1: band_mins.
      const { tx: tx1, freshKeypairs: kp1 } = await buildSetPayrollBandMinsTx({
        connection, wallet, treasury: treasuryPda, bandMinPlaintexts,
      });
      const sig1 = await wallet.sendTransaction!(tx1, connection, { signers: kp1 });
      await connection.confirmTransaction(sig1, "confirmed");
      kp1.length = 0;

      // Tx 2: band_maxs.
      const { tx: tx2, freshKeypairs: kp2 } = await buildSetPayrollBandMaxsTx({
        connection, wallet, treasury: treasuryPda, bandMaxPlaintexts,
      });
      const sig2 = await wallet.sendTransaction!(tx2, connection, { signers: kp2 });
      await connection.confirmTransaction(sig2, "confirmed");
      kp2.length = 0;

      // Tx 3: threshold + multiplier.
      const { tx: tx3, freshKeypairs: kp3 } = await buildSetPayrollThresholdTx({
        connection,
        wallet,
        treasury: treasuryPda,
        performanceThresholdPlaintext: toLamports(values.performanceThreshold),
        bonusMultiplierBps: values.bonusMultiplierBps,
      });
      const sig3 = await wallet.sendTransaction!(tx3, connection, { signers: kp3 });
      await connection.confirmTransaction(sig3, "confirmed");
      kp3.length = 0;

      return sig3; // Return the last signature for the explorer link.
    },
    onSuccess: (signature) => {
      setEncryptPhase({ kind: "Done", signature });
      toast.success("Payroll config saved", {
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
      queryClient.invalidateQueries({ queryKey: ["payrollConfig", treasuryPda.toBase58()] });
      // Clear plaintext state (Req 9.12).
      form.reset();
    },
    onError: (err) => {
      const type = classifyError(err, encryptPhase);
      const msg = errorMessage(type, err);
      setEncryptPhase({ kind: "Error", type, message: msg });
      toast.error("Failed to save payroll config", { description: msg });
    },
  });

  const isSubmitting = mutation.isPending;
  const phaseLabel =
    encryptPhase.kind === "EnsureDeposit"
      ? "Setting up encrypted deposit…"
      : encryptPhase.kind === "Submitting"
      ? encryptPhase.label
      : null;

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
        className="space-y-6"
      >
        {/* Salary bands per role tier */}
        <div className="space-y-4">
          <p className="text-sm font-medium">Salary bands (SOL) — encrypted on-chain</p>
          <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
            <span>Role tier</span>
            <span>Band min (SOL)</span>
            <span>Band max (SOL)</span>
          </div>
          {ROLE_TIERS.map((tier, i) => (
            <div key={tier} className="grid grid-cols-3 gap-2 items-start">
              <span className="pt-2 text-sm">{tier}</span>
              <FormField
                control={form.control}
                name={`bandMin${i}` as keyof FormValues}
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        step="0.001"
                        min="0"
                        placeholder="0"
                        aria-label={`${tier} band min`}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`bandMax${i}` as keyof FormValues}
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        step="0.001"
                        min="0"
                        placeholder="0"
                        aria-label={`${tier} band max`}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          ))}
        </div>

        {/* Performance threshold + bonus multiplier */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="performanceThreshold"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Performance threshold (SOL)</FormLabel>
                <FormControl>
                  <Input {...field} type="number" step="0.001" min="0" placeholder="5" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="bonusMultiplierBps"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Bonus multiplier (basis points)</FormLabel>
                <FormControl>
                  <Input {...field} type="number" min={0} max={10000} placeholder="1000" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Phase indicator */}
        {phaseLabel && (
          <p className="text-sm text-muted-foreground animate-pulse">{phaseLabel}</p>
        )}
        {encryptPhase.kind === "Error" && (
          <p className="text-sm text-destructive">{encryptPhase.message}</p>
        )}

        {/* Disable submit while any phase is active (Req 9.5) */}
        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? (phaseLabel ?? "Saving…") : "Save payroll config"}
        </Button>
      </form>
    </Form>
  );
}
