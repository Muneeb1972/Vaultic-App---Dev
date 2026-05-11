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
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={mutation.isPending}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          height: "32px",
          padding: "0 12px",
          fontSize: "12px",
          fontWeight: 500,
          borderRadius: "6px",
          border: "1px solid rgba(255,255,255,0.15)",
          background: "rgb(220,38,38)",
          color: "white",
          cursor: mutation.isPending ? "not-allowed" : "pointer",
          opacity: mutation.isPending ? 0.6 : 1,
          whiteSpace: "nowrap",
          boxSizing: "border-box",
        }}
      >
        <Trash2 style={{ width: "13px", height: "13px" }} />
        Terminate
      </button>
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
