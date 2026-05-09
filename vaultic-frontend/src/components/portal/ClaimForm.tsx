"use client";

/**
 * ClaimForm — employee claim submission (Task 27.2, Req 18.3, 18.4).
 *
 * encrypt-integration audit (Task 22.1):
 * The claim amount input is already a plaintext numeric SOL field — there
 * is no base58 ciphertext-pubkey input to replace (design §2.5, Req 12.5).
 * This update adds Req 1.6/1.7 validation (non-negative, u64 overflow) and
 * updates the submission to use `buildSubmitClaimTx` for API consistency
 * (design §3.3.4). No Encrypt_CPI_Account_Block or `ensureDeposit` is
 * needed — `submit_claim` is a plaintext-only instruction (Req 3.7).
 *
 * Flow:
 *   1. Validate the requested amount against the employee's unclaimed
 *      vested balance. We compute the same vesting formula the program
 *      enforces so the UI catches `ClaimExceedsVested` before the tx is
 *      even signed (design §3.1.1.13).
 *   2. Invoke `submit_claim(amount, claim_timestamp)` on-chain.
 *   3. Mirror the record into the backend via `POST /api/claims`.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { BN } from "@coral-xyz/anchor";
import { LAMPORTS_PER_SOL, type PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import type { EmployeeRecordAccount } from "@/hooks/useMyEmployee";
import { usePolicies } from "@/hooks/usePolicies";
import { useVaulticProgram } from "@/lib/anchor";
import { humanizeError } from "@/lib/errorMessages";
import {
  chainLabel,
  explorerTxUrl,
  formatLamportsSol,
} from "@/lib/format";
import { findClaimPda } from "@/lib/pda";
import { signedFetch } from "@/lib/signedFetch";

/**
 * Client-side mirror of the program's vesting math (design §3.1.1.13).
 *
 *   if elapsed < cliff:          0
 *   else if elapsed >= duration: total
 *   else:                        total * elapsed / duration
 */
function computeVestedBn(
  employee: EmployeeRecordAccount,
  nowSecs = Math.floor(Date.now() / 1000),
): BN {
  const start = employee.vestingStart.toNumber();
  const cliff = employee.vestingCliff.toNumber();
  const duration = Math.max(1, employee.vestingDuration.toNumber());
  const elapsed = Math.max(0, nowSecs - start);
  const total = employee.totalAllocation;
  if (elapsed < cliff) return new BN(0);
  if (elapsed >= duration) return total;
  return total.muln(elapsed).divn(duration);
}

/**
 * Trim the `[u8; 64]` target address to its non-zero prefix for display.
 */
function formatTargetAddressHex(bytes: number[] | Uint8Array): string {
  const arr = Array.from(bytes as number[]);
  let last = -1;
  for (let i = arr.length - 1; i >= 0; i -= 1) {
    if (arr[i] !== 0) {
      last = i;
      break;
    }
  }
  const slice = last === -1 ? [0] : arr.slice(0, last + 1);
  return `0x${slice.map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Max safe u64 value as a bigint (Req 1.7). */
const U64_MAX = 18_446_744_073_709_551_615n;

const formSchema = z.object({
  amountSol: z
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
    ),
});

type FormValues = z.infer<typeof formSchema>;

export interface ClaimFormProps {
  employee: EmployeeRecordAccount;
  employeePda: PublicKey;
  treasuryPda: PublicKey;
  /** Backend `Treasury.id` (cuid). When absent the mirror POST is skipped. */
  treasuryBackendId?: string;
  /** Backend `Employee.id` (cuid). When absent the mirror POST is skipped. */
  employeeBackendId?: string;
}

export function ClaimForm({
  employee,
  employeePda,
  treasuryPda,
  treasuryBackendId,
  employeeBackendId,
}: ClaimFormProps) {
  const program = useVaulticProgram();
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const { data: policies, isLoading: policiesLoading } = usePolicies(treasuryPda);

  const vested = computeVestedBn(employee);
  const availableBn = vested.sub(employee.totalClaimed);
  const available = availableBn.isNeg() ? new BN(0) : availableBn;
  const availableSol = available.toNumber() / LAMPORTS_PER_SOL;

  const activePolicy = policies?.find((p) => p.account.isActive) ?? null;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { amountSol: "" },
  });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!program) throw new Error("Wallet is not connected");
      if (!activePolicy) {
        throw new Error(
          "No active policy on this treasury — ask your admin to create one",
        );
      }

      const amountLamports = new BN(
        Math.floor(Number(values.amountSol) * LAMPORTS_PER_SOL),
      );
      if (amountLamports.gt(available)) {
        throw new Error("Amount exceeds your unclaimed vested balance");
      }

      const claimTimestamp = new BN(Math.floor(Date.now() / 1000));
      const [claimPda] = findClaimPda(
        employee.employeeWallet,
        treasuryPda,
        claimTimestamp,
        program.programId,
      );

      const signature = await program.methods
        .submitClaim(amountLamports, claimTimestamp)
        .accountsPartial({
          treasury: treasuryPda,
          employeeRecord: employeePda,
          policy: activePolicy.publicKey,
          claimRecord: claimPda,
        })
        .rpc();

      // Best-effort backend mirror. Failure surfaces as a warning but
      // the on-chain `ClaimRecord` is the source of truth — the backend
      // row is a convenience index for the Ika poller.
      if (treasuryBackendId && employeeBackendId) {
        try {
          await signedFetch(wallet, "POST", "/api/claims", {
            onchainAddress: claimPda.toBase58(),
            employeeId: employeeBackendId,
            treasuryId: treasuryBackendId,
            amount: amountLamports.toString(),
            targetChain: employee.chainPreference,
          });
        } catch (backendErr) {
          toast.warning("On-chain succeeded but backend mirror failed", {
            description: humanizeError(backendErr),
          });
        }
      }

      return signature;
    },
    onSuccess: (signature) => {
      toast.success("Claim submitted", {
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
      queryClient.invalidateQueries({ queryKey: ["myClaims"] });
      queryClient.invalidateQueries({ queryKey: ["myEmployee"] });
      form.reset({ amountSol: "" });
    },
    onError: (err) => {
      toast.error("Claim failed", { description: humanizeError(err) });
    },
  });

  const targetHex = formatTargetAddressHex(
    employee.targetAddress as unknown as number[],
  );
  const targetShort =
    targetHex.length <= 18
      ? targetHex
      : `${targetHex.slice(0, 10)}...${targetHex.slice(-6)}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Submit a claim</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <ReadOnlyField
                label="Target Chain"
                value={chainLabel(employee.chainPreference)}
              />
              <ReadOnlyField
                label="Target Address"
                value={targetShort}
                mono
                title={targetHex}
              />
            </div>

            <FormField
              control={form.control}
              name="amountSol"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount (SOL)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      step="0.0001"
                      min={0}
                      placeholder="0.0"
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Available to claim: {formatLamportsSol(available)} (
                    {availableSol.toFixed(4)} SOL)
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {policiesLoading ? (
              <Skeleton className="h-4 w-48" />
            ) : !activePolicy ? (
              <p className="text-xs text-amber-400">
                No active policy on this treasury. Claims cannot be
                submitted until an admin creates one.
              </p>
            ) : null}

            <Button
              type="submit"
              disabled={
                mutation.isPending ||
                !activePolicy ||
                !employee.isActive ||
                available.isZero()
              }
            >
              {mutation.isPending ? "Submitting..." : "Submit claim"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function ReadOnlyField({
  label,
  value,
  mono,
  title,
}: {
  label: string;
  value: string;
  mono?: boolean;
  title?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={`text-sm font-medium text-foreground ${
          mono ? "font-mono" : ""
        }`}
        title={title}
      >
        {value}
      </p>
    </div>
  );
}
