"use client";

/**
 * TerminateEmployeeButton — confirm + invoke `terminate_employee` on-chain
 * (Task 26.2).
 *
 * Flow:
 *   1. Click the "Terminate" button → opens a confirm dialog.
 *   2. Confirm → `useMutation` fires the Anchor instruction; on success,
 *      toast with an explorer link and invalidate `["employees", ...]`.
 *   3. Error → human-readable toast via `humanizeError`.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type PublicKey } from "@solana/web3.js";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useVaulticProgram } from "@/lib/anchor";
import { humanizeError } from "@/lib/errorMessages";
import { explorerTxUrl, shortenAddress } from "@/lib/format";

export interface TerminateEmployeeButtonProps {
  employeePda: PublicKey;
  employeeWallet: PublicKey;
  treasuryPda: PublicKey;
}

export function TerminateEmployeeButton({
  employeePda,
  employeeWallet,
  treasuryPda,
}: TerminateEmployeeButtonProps) {
  const [open, setOpen] = useState(false);
  const program = useVaulticProgram();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      if (!program) throw new Error("Wallet is not connected");
      return program.methods
        .terminateEmployee()
        .accountsPartial({
          treasury: treasuryPda,
          employeeRecord: employeePda,
        })
        .rpc();
    },
    onSuccess: (signature) => {
      toast.success("Employee terminated", {
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
      queryClient.invalidateQueries({
        queryKey: ["treasury"],
      });
      setOpen(false);
    },
    onError: (err) => {
      toast.error("Termination failed", { description: humanizeError(err) });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={mutation.isPending}
        className="gap-1.5 px-3 text-xs h-9"
        style={{ height: "36px", minHeight: "36px" }}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Terminate
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Terminate employee?</DialogTitle>
          <DialogDescription>
            This deactivates{" "}
            <span className="font-mono">{shortenAddress(employeeWallet)}</span>
            . They will no longer be able to submit claims or request
            salary decryption. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Terminating..." : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
