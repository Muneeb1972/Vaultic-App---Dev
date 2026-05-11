"use client";

/**
 * EditEmployeeDialog — identical layout to AddEmployeeDialog but pre-filled
 * with the employee's existing data and saving via PATCH /api/employees/:id.
 *
 * All fields are shown as editable inputs (same UX as registration).
 * Compensation values (salary, bonus, performance) are pre-filled from the
 * backend mirror stored at registration time. On-chain fields (wallet, role,
 * chain, vesting) are pre-filled from the on-chain EmployeeEntry.
 *
 * On save: sends all fields to PATCH /api/employees/:id (backend only —
 * on-chain data is immutable without a new register_employee transaction).
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
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
import type { BackendEmployee } from "@/components/employees/EmployeesTable";
import type { EmployeeEntry } from "@/hooks/useEmployees";
import { humanizeError } from "@/lib/errorMessages";
import { signedFetch } from "@/lib/signedFetch";
import type { PublicKey as PublicKeyType } from "@solana/web3.js";

// ── Schema (mirrors AddEmployeeDialog — all fields optional for edit) ─────

const U64_MAX = 18_446_744_073_709_551_615n;

const plaintextSolAmount = z
  .string()
  .min(1, "Required")
  .refine((v) => !isNaN(Number(v)) && Number(v) >= 0, {
    message: "Must be a non-negative number",
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
    { message: "Value exceeds maximum u64 lamports" },
  );

const hexOrBase58String = z
  .string()
  .min(1, "Required")
  .refine(
    (value) => {
      try {
        new PublicKey(value);
        return true;
      } catch {}
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
      try {
        new PublicKey(v);
        return true;
      } catch {
        return false;
      }
    }, { message: "Invalid base58 public key" }),
  roleId: z.coerce.number().int().min(0).max(4),
  chainPreference: z.coerce.number().int().min(0).max(2),
  targetAddressHex: hexOrBase58String,
  salarySol: plaintextSolAmount,
  bonusSol: plaintextSolAmount,
  performanceSol: plaintextSolAmount,
  totalAllocationSol: z.coerce.number().nonnegative(),
  vestingStart: z.string().min(1, "Required"),
  vestingCliffDays: z.coerce.number().int().nonnegative(),
  vestingDurationDays: z.coerce.number().int().positive(),
});

type FormValues = z.infer<typeof formSchema>;

// ── Props ─────────────────────────────────────────────────────────────────

export interface EditEmployeeDialogProps {
  entry: EmployeeEntry;
  backend?: BackendEmployee;
  treasuryPda: PublicKeyType;
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Convert on-chain targetAddress bytes to a base58 string if valid, else hex. */
function targetAddressToString(bytes: number[] | Uint8Array): string {
  try {
    // Trim trailing zero bytes before trying base58
    const arr = Array.from(bytes);
    const lastNonZero = arr.reduceRight(
      (acc, b, i) => (acc === -1 && b !== 0 ? i : acc),
      -1,
    );
    const trimmed = arr.slice(0, lastNonZero + 1);
    if (trimmed.length === 32) {
      return new PublicKey(new Uint8Array(trimmed)).toBase58();
    }
  } catch {}
  return Buffer.from(bytes).toString("hex").replace(/0+$/, "");
}

// ── Component ─────────────────────────────────────────────────────────────

export function EditEmployeeDialog({
  entry,
  backend,
  treasuryPda,
}: EditEmployeeDialogProps) {
  const [open, setOpen] = useState(false);
  const wallet = useWallet();
  const queryClient = useQueryClient();

  const { account } = entry;

  // Build default values: prefer backend mirrors, fall back to on-chain data.
  const defaultValues: FormValues = {
    name: backend?.name ?? "",
    email: backend?.email ?? "",
    employeeWallet: account.employeeWallet.toBase58(),
    roleId: backend?.roleId ?? account.roleId ?? 0,
    chainPreference: backend?.chainPreference ?? account.chainPreference ?? 0,
    targetAddressHex:
      backend?.targetAddressHex ??
      targetAddressToString(account.targetAddress),
    salarySol: backend?.salarySol ?? "",
    bonusSol: backend?.bonusSol ?? "",
    performanceSol: backend?.performanceSol ?? "",
    totalAllocationSol: backend?.totalAllocationSol
      ? Number(backend.totalAllocationSol)
      : account.totalAllocation
      ? Number(account.totalAllocation) / 1e9
      : 0,
    vestingStart:
      backend?.vestingStart ??
      (account.vestingStart
        ? new Date(Number(account.vestingStart) * 1000)
            .toISOString()
            .slice(0, 10)
        : new Date().toISOString().slice(0, 10)),
    vestingCliffDays:
      backend?.vestingCliffDays ??
      (account.vestingCliff
        ? Math.round(Number(account.vestingCliff) / 86_400)
        : 0),
    vestingDurationDays:
      backend?.vestingDurationDays ??
      (account.vestingDuration
        ? Math.round(Number(account.vestingDuration) / 86_400)
        : 365),
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!wallet.publicKey) throw new Error("Wallet is not connected");
      if (!backend?.id) {
        throw new Error(
          "No backend record found for this employee. Re-register to create one.",
        );
      }

      return signedFetch(wallet, "PATCH", `/api/employees/${backend.id}`, {
        name: values.name,
        email: values.email || undefined,
        salarySol: values.salarySol,
        bonusSol: values.bonusSol,
        performanceSol: values.performanceSol,
        roleId: values.roleId,
        chainPreference: values.chainPreference,
        targetAddressHex: values.targetAddressHex,
        totalAllocationSol: String(values.totalAllocationSol),
        vestingStart: values.vestingStart,
        vestingCliffDays: values.vestingCliffDays,
        vestingDurationDays: values.vestingDurationDays,
      });
    },
    onSuccess: () => {
      toast.success("Employee details updated");
      queryClient.invalidateQueries({
        queryKey: ["employees", treasuryPda.toBase58()],
      });
      queryClient.invalidateQueries({
        queryKey: ["backendEmployees"],
      });
      setOpen(false);
    },
    onError: (err) => {
      toast.error("Update failed", { description: humanizeError(err) });
    },
  });

  const isSubmitting = mutation.isPending;

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) form.reset(defaultValues);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 px-3 text-xs"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Employee Details</DialogTitle>
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
            {/* Name + Email */}
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

            {/* Employee wallet */}
            <FormField
              control={form.control}
              name="employeeWallet"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Employee wallet (base58)</FormLabel>
                  <FormControl>
                    <Input {...field} className="font-mono" readOnly />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Role + Chain */}
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

            {/* Target address */}
            <FormField
              control={form.control}
              name="targetAddressHex"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Target address (Solana base58 or hex)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      className="font-mono"
                      placeholder="Paste Solana address or hex bytes…"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Compensation */}
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
                        <Input
                          {...field}
                          type="number"
                          step="0.001"
                          min="0"
                          placeholder="10"
                        />
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
                        <Input
                          {...field}
                          type="number"
                          step="0.001"
                          min="0"
                          placeholder="2"
                        />
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
                        <Input
                          {...field}
                          type="number"
                          step="0.001"
                          min="0"
                          placeholder="1"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Vesting */}
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

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving…" : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
