"use client";

/**
 * ExecutePayrollButton — CTA that invokes `execute_payroll_computation`
 * (Task 26.3, Req 16.2–16.4).
 *
 * Countdown gating (Req 16.4): if `now - last_payroll_timestamp <
 * payroll_interval`, the button is disabled and we render a "Next payroll
 * in Xh Ym" label instead. Once the interval elapses, the button
 * activates.
 *
 * ### What's wired on-chain vs deferred
 *
 * The instruction needs a lot of accounts — the Encrypt CPI context plus
 * five ciphertext accounts and the `ct_total_out` keypair. This MVP:
 *
 *   - Pulls `ct_salary` / `ct_bonus` / `ct_performance` from the first
 *     active `EmployeeRecord` in the treasury. Multi-employee batching is
 *     a future task (Task 29 / design §11).
 *   - Pulls `ct_band_min` / `ct_band_max` from the `PayrollConfig` for
 *     role_id 0 (Junior) — same simplification as above.
 *   - Generates a fresh `ct_total_out` keypair client-side. The Encrypt
 *     CPI initialises it as the computation output.
 *   - Derives `encryptCpiAuthority` via `findEncryptCpiAuthority`.
 *
 * Env-resolved accounts (`encryptProgram`, `config`, `deposit`,
 * `callerProgram`, `networkEncryptionKey`, `eventAuthority`) are read from
 * `NEXT_PUBLIC_ENCRYPT_*` env vars. When an env var is missing we fall
 * back to `PublicKey.default` which will fail on-chain — this is on
 * purpose: the failure is loud, visible via the toast, and the dev
 * surfaces a configuration error rather than silently corrupting state.
 */
import { BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useVaulticProgram } from "@/lib/anchor";
import { humanizeError } from "@/lib/errorMessages";
import { explorerTxUrl, formatDuration } from "@/lib/format";
import {
  findEncryptCpiAuthority,
  findPayrollExecPda,
} from "@/lib/pda";
import { buildEncryptCpiAccounts } from "@/lib/encrypt/cpiAccounts";
import type { EmployeeEntry } from "@/hooks/useEmployees";
import type { PayrollConfigAccount } from "@/hooks/usePayrollConfig";
import type { TreasuryAccount } from "@/hooks/useTreasury";

/**
 * Convert an IDL-decoded `[u8; 32]` array back into a `PublicKey`. Anchor
 * decodes fixed-size arrays as `number[]`, not `Uint8Array`.
 */
function bytesToPublicKey(bytes: number[] | Uint8Array): PublicKey {
  return new PublicKey(Uint8Array.from(bytes as number[]));
}

export interface ExecutePayrollButtonProps {
  treasury: TreasuryAccount;
  treasuryPda: PublicKey;
  payrollConfig: PayrollConfigAccount | null;
  employees: EmployeeEntry[] | undefined;
}

export function ExecutePayrollButton({
  treasury,
  treasuryPda,
  payrollConfig,
  employees,
}: ExecutePayrollButtonProps) {
  const program = useVaulticProgram();
  const { connection } = useConnection();
  const wallet = useWallet();
  const queryClient = useQueryClient();

  // Re-render every second so the countdown label updates smoothly.
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const last = treasury.lastPayrollTimestamp.toNumber();
  const interval = treasury.payrollInterval.toNumber();
  const elapsed = now - last;
  const remaining = Math.max(0, interval - elapsed);
  const canExecute = last === 0 || elapsed >= interval;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!program) throw new Error("Wallet is not connected");
      if (!payrollConfig) {
        throw new Error("Configure payroll bands before executing");
      }
      const activeEmployee = employees?.find((e) => e.account.isActive);
      if (!activeEmployee) {
        throw new Error(
          "No active employees registered — add at least one employee first",
        );
      }

      // Derive execution counter from the current run count. Not strictly
      // monotonic in the face of concurrent runs, but the backend's
      // `execution_id` is always chosen by the admin and collisions just
      // revert with an `Already in use` error that the toast surfaces.
      const executionId = new BN(Date.now());

      const [payrollExecPda] = findPayrollExecPda(
        treasuryPda,
        executionId,
        program.programId,
      );
      const [, cpiAuthorityBump] = findEncryptCpiAuthority(program.programId);

      // Generate the output ciphertext account.
      const ctTotalOut = Keypair.generate();

      const employee = activeEmployee;

      const ctSalary = bytesToPublicKey(
        employee.account.encryptedSalary as unknown as number[],
      );
      const ctBonus = bytesToPublicKey(
        employee.account.encryptedBonus as unknown as number[],
      );
      const ctPerformance = bytesToPublicKey(
        employee.account.encryptedPerformance as unknown as number[],
      );
      const ctBandMin = bytesToPublicKey(
        payrollConfig.bandMin[0] as unknown as number[],
      );
      const ctBandMax = bytesToPublicKey(
        payrollConfig.bandMax[0] as unknown as number[],
      );

      // Derive Encrypt CPI accounts properly instead of using env vars.
      if (!wallet.publicKey) throw new Error("Wallet not connected");
      const enc = await buildEncryptCpiAccounts(connection, wallet.publicKey);

      return program.methods
        .executePayrollComputation(executionId, cpiAuthorityBump)
        .accountsPartial({
          treasury: treasuryPda,
          employee: employee.publicKey,
          payrollExecution: payrollExecPda,
          encryptProgram: enc.encryptProgram,
          config: enc.configPda,
          deposit: enc.depositPda,
          callerProgram: enc.callerProgram,
          networkEncryptionKey: enc.networkKeyPda,
          eventAuthority: enc.eventAuthority,
          ctSalary,
          ctBonus,
          ctPerformance,
          ctBandMin,
          ctBandMax,
          ctTotalOut: ctTotalOut.publicKey,
        })
        .rpc(); // ctTotalOut is not a signer — Encrypt CPI is skipped on devnet
    },
    onSuccess: (signature) => {
      toast.success("Payroll execution started", {
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
        queryKey: ["payrollRuns", treasuryPda.toBase58()],
      });
      queryClient.invalidateQueries({ queryKey: ["treasury"] });
    },
    onError: (err) => {
      toast.error("Payroll execution failed", {
        description: humanizeError(err),
      });
    },
  });

  return (
    <div className="flex items-center gap-4">
      <Button
        size="lg"
        onClick={() => mutation.mutate()}
        disabled={!canExecute || mutation.isPending}
      >
        {mutation.isPending ? "Executing..." : "Execute Payroll"}
      </Button>
      {!canExecute && last > 0 ? (
        <p className="text-sm text-muted-foreground">
          Next payroll in {formatDuration(remaining)}
        </p>
      ) : null}
    </div>
  );
}
