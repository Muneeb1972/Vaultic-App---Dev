"use client";

/**
 * EditEmployeeDialog — pre-filled modal for editing an employee's off-chain
 * display fields (name, email).
 *
 * On-chain fields (role, vesting, compensation, wallet) are shown as
 * read-only context — they are immutable once `register_employee` is
 * confirmed on-chain. Only `name` and `email` (stored in the backend DB)
 * can be updated via `PATCH /api/employees/:id`.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useWallet } from "@solana/wallet-adapter-react";
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
import type { EmployeeEntry } from "@/hooks/useEmployees";
import { humanizeError } from "@/lib/errorMessages";
import {
  chainLabel,
  formatUnixTimestamp,
  roleLabel,
  shortenAddress,
} from "@/lib/format";
import { signedFetch } from "@/lib/signedFetch";
import type { PublicKey } from "@solana/web3.js";

// ── Schema ────────────────────────────────────────────────────────────────

const formSchema = z.object({
  name: z.string().min(1, "Required").max(128),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
});

type FormValues = z.infer<typeof formSchema>;

// ── Props ─────────────────────────────────────────────────────────────────

export interface EditEmployeeDialogProps {
  /** The on-chain employee entry (provides pre-fill data). */
  entry: EmployeeEntry;
  /** Backend Employee row id (cuid) — needed for the PATCH call. */
  backendId?: string;
  /** Backend-stored name — pre-fills the name field. */
  backendName?: string;
  /** Backend-stored email — pre-fills the email field. */
  backendEmail?: string;
  /** Treasury PDA — used to invalidate the employees query on success. */
  treasuryPda: PublicKey;
}

// ── Component ─────────────────────────────────────────────────────────────

export function EditEmployeeDialog({
  entry,
  backendId,
  backendName,
  backendEmail,
  treasuryPda,
}: EditEmployeeDialogProps) {
  const [open, setOpen] = useState(false);
  const wallet = useWallet();
  const queryClient = useQueryClient();

  const { account } = entry;

  // Derive display values from on-chain data
  const vestingStartDate =
    account.vestingStart
      ? new Date(Number(account.vestingStart) * 1000).toISOString().slice(0, 10)
      : "";
  const vestingCliffDays = account.vestingCliff
    ? Math.round(Number(account.vestingCliff) / 86_400)
    : 0;
  const vestingDurationDays = account.vestingDuration
    ? Math.round(Number(account.vestingDuration) / 86_400)
    : 365;
  const totalAllocationSol = account.totalAllocation
    ? (Number(account.totalAllocation) / 1e9).toString()
    : "0";

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: backendName ?? "",
      email: backendEmail ?? "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!wallet.publicKey) throw new Error("Wallet is not connected");

      if (!backendId) {
        // No backend row — nothing to update. Show a warning.
        throw new Error(
          "This employee has no backend record. Re-register to create one.",
        );
      }

      return signedFetch(wallet, "PATCH", `/api/employees/${backendId}`, {
        name: values.name,
        email: values.email || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Employee details updated");
      queryClient.invalidateQueries({
        queryKey: ["employees", treasuryPda.toBase58()],
      });
      queryClient.invalidateQueries({ queryKey: ["backendEmployees"] });
      setOpen(false);
    },
    onError: (err) => {
      toast.error("Update failed", { description: humanizeError(err) });
    },
  });

  const isSubmitting = mutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) form.reset({ name: backendName ?? "", email: backendEmail ?? "" });
      }}
    >
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </Button>

      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Employee Details</DialogTitle>
          <DialogDescription>
            Update the display name and email for this employee. On-chain fields
            (role, vesting, compensation) are immutable once registered.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="space-y-4"
          >
            {/* ── Editable fields ── */}
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

            {/* ── Read-only on-chain fields ── */}
            <div className="rounded-md border border-border bg-muted/30 p-4 space-y-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                On-chain fields (read-only)
              </p>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">
                    Employee wallet (base58)
                  </p>
                  <p className="font-mono text-sm break-all">
                    {account.employeeWallet.toBase58()}
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">
                    Target address
                  </p>
                  <p className="font-mono text-sm break-all">
                    {shortenAddress(
                      Buffer.from(account.targetAddress).toString("hex"),
                      8,
                    )}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">
                    Role tier
                  </p>
                  <p className="text-sm">{roleLabel(account.roleId)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">
                    Chain preference
                  </p>
                  <p className="text-sm">
                    {chainLabel(account.chainPreference)}
                  </p>
                </div>
              </div>

              <p className="text-xs uppercase tracking-wider text-muted-foreground pt-2">
                Compensation (encrypted on-chain)
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">
                    Salary (SOL)
                  </p>
                  <p className="text-sm text-muted-foreground italic">
                    Encrypted
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">
                    Bonus (SOL)
                  </p>
                  <p className="text-sm text-muted-foreground italic">
                    Encrypted
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">
                    Performance score (SOL)
                  </p>
                  <p className="text-sm text-muted-foreground italic">
                    Encrypted
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">
                    Total allocation (SOL)
                  </p>
                  <p className="text-sm">{totalAllocationSol}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">
                    Vesting start
                  </p>
                  <p className="text-sm">{vestingStartDate}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">
                    Cliff (days)
                  </p>
                  <p className="text-sm">{vestingCliffDays}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">
                    Duration (days)
                  </p>
                  <p className="text-sm">{vestingDurationDays}</p>
                </div>
              </div>
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
