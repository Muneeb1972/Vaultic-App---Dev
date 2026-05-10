"use client";

/**
 * AddEmployeeDialog — plaintext-first variant.
 *
 * Replaces the three base58 ciphertext-pubkey inputs with numeric plaintext
 * SOL inputs (salary, bonus, performance). On submit:
 *   1. `ensureDeposit` — one-time Encrypt deposit bootstrap (Req 3.2).
 *   2. `buildRegisterEmployeeTx` — generates three Fresh_Ciphertext_Keypairs,
 *      builds the instruction with the nine Encrypt_CPI_Account_Block accounts.
 *   3. `wallet.sendTransaction` — signs with admin wallet + three fresh keypairs.
 *   4. Off-chain backend mirror — best-effort POST to `/api/employees`.
 *
 * encrypt-integration Req 1.1, Req 1.4, Req 1.6–1.8, Req 2.1–2.6,
 * Req 9.1–9.5, Req 9.11–9.12
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
import { humanizeError } from "@/lib/errorMessages";
import { explorerTxUrl, hexToBytes, padBytes } from "@/lib/format";
import { signedFetch } from "@/lib/signedFetch";
import { buildRegisterEmployeeTx } from "@/lib/encrypt/txBuilder";
import { classifyError, errorMessage } from "@/lib/encrypt/errorClassifier";
import { useEnsureDeposit } from "@/hooks/useEnsureDeposit";
import type { EncryptPhase } from "@/lib/encrypt/types";
import type { PublicKey as PublicKeyType } from "@solana/web3.js";

// ── Validation helpers ────────────────────────────────────────────────────

/** Max safe u64 value as a bigint. */
const U64_MAX = 18_446_744_073_709_551_615n;

/**
 * Validate a plaintext SOL amount string.
 * - Must be a non-negative number.
 * - Lamports representation must fit in u64 (Req 1.7).
 * - Plaintext is NEVER logged (Req 9.11).
 */
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

/** Hex string up to 128 chars (= 64 bytes), OR a base58 Solana pubkey. */
const hexOrBase58String = z
  .string()
  .min(1, "Required")
  .refine(
    (value) => {
      // Accept base58 Solana pubkey (32 bytes = fits in 64 bytes)
      try { new PublicKey(value); return true; } catch {}
      // Accept hex string (with or without 0x prefix, max 128 hex chars)
      const stripped = value.startsWith("0x") ? value.slice(2) : value;
      return /^[0-9a-fA-F]*$/.test(stripped) && stripped.length <= 128;
    },
    { message: "Enter a Solana address (base58) or hex string (max 64 bytes)" },
  );

const formSchema = z.object({
  name: z.string().min(1, "Required").max(128),
  email: z.string().email().optional().or(z.literal("")),
  employeeWallet: z
    .string()
    .min(32, "Must be a base58 public key")
    .refine((v) => {
      try { new PublicKey(v); return true; } catch { return false; }
    }, { message: "Invalid base58 public key" }),
  roleId: z.coerce.number().int().min(0).max(4),
  chainPreference: z.coerce.number().int().min(0).max(2),
  targetAddressHex: hexOrBase58String,
  // ── NEW: plaintext SOL amounts (Req 1.1) ──
  salarySol: plaintextSolAmount,
  bonusSol: plaintextSolAmount,
  performanceSol: plaintextSolAmount,
  // ── existing plaintext fields ──
  totalAllocationSol: z.coerce.number().nonnegative(),
  vestingStart: z.string().min(1, "Required"),
  vestingCliffDays: z.coerce.number().int().nonnegative(),
  vestingDurationDays: z.coerce.number().int().positive(),
});

type FormValues = z.infer<typeof formSchema>;

export interface AddEmployeeDialogProps {
  treasuryPda: PublicKeyType;
  treasuryBackendId?: string;
}

export function AddEmployeeDialog({
  treasuryPda,
  treasuryBackendId,
}: AddEmployeeDialogProps) {
  const [open, setOpen] = useState(false);
  const [encryptPhase, setEncryptPhase] = useState<EncryptPhase>({ kind: 'Idle' });
  const { connection } = useConnection();
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const { ensureDeposit } = useEnsureDeposit();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      employeeWallet: "",
      roleId: 0,
      chainPreference: 0,
      targetAddressHex: "",
      salarySol: "",
      bonusSol: "",
      performanceSol: "1",
      totalAllocationSol: 0,
      vestingStart: new Date().toISOString().slice(0, 10),
      vestingCliffDays: 0,
      vestingDurationDays: 365,
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!wallet.publicKey) throw new Error("Wallet is not connected");

      // Step 1: Ensure deposit (Req 3.2). Phase indicator shown during bootstrap.
      setEncryptPhase({ kind: 'EnsureDeposit' });
      await ensureDeposit();

      // Step 2: Build the plaintext-first transaction.
      setEncryptPhase({ kind: 'Submitting', label: 'Registering employee…' });

      const employeeWalletKey = new PublicKey(values.employeeWallet);

      // Convert target address: accept base58 Solana pubkey or hex string.
      let targetBytes: Uint8Array;
      try {
        // Try base58 first (Solana address)
        const pk = new PublicKey(values.targetAddressHex);
        targetBytes = padBytes(pk.toBytes(), 64);
      } catch {
        // Fall back to hex
        targetBytes = padBytes(hexToBytes(values.targetAddressHex), 64);
      }

      // Convert SOL → lamports as bigint (Req 1.4, Req 9.11 — no logging).
      const salaryLamports = BigInt(Math.round(Number(values.salarySol) * 1e9));
      const bonusLamports = BigInt(Math.round(Number(values.bonusSol) * 1e9));
      const performanceLamports = BigInt(Math.round(Number(values.performanceSol) * 1e9));
      const totalAllocationLamports = BigInt(Math.round(values.totalAllocationSol * 1e9));

      const vestingStartSecs = BigInt(
        Math.floor(new Date(values.vestingStart).getTime() / 1000),
      );
      const vestingCliffSecs = BigInt(values.vestingCliffDays * 86_400);
      const vestingDurationSecs = BigInt(values.vestingDurationDays * 86_400);

      const { tx, freshKeypairs } = await buildRegisterEmployeeTx({
        connection,
        wallet,
        treasury: treasuryPda,
        employeeWallet: employeeWalletKey,
        roleId: values.roleId,
        plaintexts: {
          salary: salaryLamports,
          bonus: bonusLamports,
          performance: performanceLamports,
        },
        vestingStart: vestingStartSecs,
        vestingCliff: vestingCliffSecs,
        vestingDuration: vestingDurationSecs,
        totalAllocation: totalAllocationLamports,
        chainPreference: values.chainPreference,
        targetAddress: targetBytes,
      });

      // Step 3: Sign and send (Req 2.2 — fresh keypairs as additional signers).
      const signature = await wallet.sendTransaction!(tx, connection, {
        signers: freshKeypairs,
      });
      await connection.confirmTransaction(signature, 'confirmed');

      // Drop fresh keypairs immediately after confirmation (Req 2.5).
      freshKeypairs.length = 0;

      // Step 4: Off-chain mirror — best-effort.
      const [employeePda] = PublicKey.findProgramAddressSync(
        [Buffer.from('employee'), treasuryPda.toBuffer(), employeeWalletKey.toBuffer()],
        new PublicKey(process.env.NEXT_PUBLIC_VAULTIC_PROGRAM_ID ?? '5igWLTbdAjGfAZKsK9G3Buhe7mkrgC3GEYkQaD4PrTnZ'),
      );

      if (treasuryBackendId) {
        try {
          await signedFetch(wallet, "POST", "/api/employees", {
            onchainAddress: employeePda.toBase58(),
            treasuryId: treasuryBackendId,
            walletAddress: employeeWalletKey.toBase58(),
            name: values.name,
            ...(values.email ? { email: values.email } : {}),
          });
        } catch (backendErr) {
          toast.warning("On-chain succeeded but backend insert failed", {
            description: humanizeError(backendErr),
          });
        }
      }

      return signature;
    },
    onSuccess: (signature) => {
      setEncryptPhase({ kind: 'Done', signature });
      toast.success("Employee registered", {
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
        queryKey: ["employees", treasuryPda.toBase58()],
      });
      queryClient.invalidateQueries({ queryKey: ["treasury"] });
      // Clear form state so plaintexts are eligible for GC (Req 9.12).
      form.reset();
      setOpen(false);
    },
    onError: (err) => {
      const type = classifyError(err, encryptPhase);
      const msg = errorMessage(type, err);
      setEncryptPhase({ kind: 'Error', type, message: msg });
      toast.error("Registration failed", { description: msg });
    },
  });

  const isSubmitting = mutation.isPending;
  const phaseLabel =
    encryptPhase.kind === 'EnsureDeposit'
      ? 'Setting up encrypted deposit…'
      : encryptPhase.kind === 'Submitting'
      ? encryptPhase.label
      : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          // Clear plaintext state on dialog close (Req 9.12).
          form.reset();
          setEncryptPhase({ kind: 'Idle' });
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>Add Employee</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Register new employee</DialogTitle>
          <DialogDescription>
            Enter plaintext SOL amounts — they are encrypted on-chain via the
            Encrypt protocol. No ciphertext pubkeys needed.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Alice" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="alice@example.com" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="employeeWallet"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Employee wallet (base58)</FormLabel>
                  <FormControl>
                    <Input {...field} className="font-mono" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="roleId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role tier</FormLabel>
                    <FormControl>
                      <select
                        {...field}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                      >
                        <option value={0}>Junior</option>
                        <option value={1}>Mid</option>
                        <option value={2}>Senior</option>
                        <option value={3}>Lead</option>
                        <option value={4}>Executive</option>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="chainPreference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Chain preference</FormLabel>
                    <FormControl>
                      <select
                        {...field}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                      >
                        <option value={0}>Solana</option>
                        <option value={1}>Ethereum</option>
                        <option value={2}>Bitcoin</option>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="targetAddressHex"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Target address (Solana base58 or hex)</FormLabel>
                  <FormControl>
                    <Input {...field} className="font-mono" placeholder="Paste Solana address or hex bytes…" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ── NEW: Plaintext SOL inputs (Req 1.1) ── */}
            <div className="space-y-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Compensation (plaintext SOL — encrypted on-chain)
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="salarySol"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Salary (SOL)</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" step="0.001" min="0" placeholder="10" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bonusSol"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bonus (SOL)</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" step="0.001" min="0" placeholder="2" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="performanceSol"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Performance score (SOL)</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" step="0.001" min="0" placeholder="1" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="totalAllocationSol"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Total allocation (SOL)</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" step="0.001" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="vestingStart"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vesting start</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="vestingCliffDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cliff (days)</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" min={0} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="vestingDurationDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (days)</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" min={1} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Phase indicator (Req 9.2–9.3) */}
            {phaseLabel && (
              <p className="text-sm text-muted-foreground animate-pulse">
                {phaseLabel}
              </p>
            )}
            {encryptPhase.kind === 'Error' && (
              <p className="text-sm text-destructive">{encryptPhase.message}</p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              {/* Disable submit while any phase is active (Req 9.5) */}
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (phaseLabel ?? "Registering…") : "Register"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
