"use client";

/**
 * DecryptSalaryButton — two-step salary reveal via the Encrypt CPI
 * (Task 27.1, Req 5.1–5.9, Req 18.1–18.2).
 *
 * Flow (design §5.4):
 *   1. Generate a fresh `Keypair` for the `decryption_request` account —
 *      the Encrypt program `init`s it inside the CPI on the first call.
 *   2. Send `request_salary_decryption(cpiAuthorityBump)` with that
 *      keypair as an additional signer. The on-chain program snapshots
 *      the returned `[u8; 32]` digest into `EmployeeRecord.pending_digest`.
 *   3. Poll the `DecryptionRequest` account every 5 s (up to 15 min)
 *      until `bytes_written == total_len`. The account belongs to the
 *      Encrypt program, so we can't decode it via Anchor — we read the
 *      raw bytes at the offsets the task spec calls out (99: `total_len`
 *      u32 LE, 103: `bytes_written` u32 LE).
 *   4. Send `reveal_salary()`. This returns the plaintext salary via
 *      Solana transaction return-data — the *only* path plaintext ever
 *      leaves the chain (Req 5.4).
 *   5. Fetch the confirmed transaction, decode the base64 return-data
 *      payload as an 8-byte little-endian u64, and render it as SOL.
 *
 * Privacy contract (Req 5.4):
 *   - The revealed value lives *only* in React component state.
 *   - Never written to `localStorage`, `sessionStorage`, URL params, a
 *     backend call, analytics, or anywhere else.
 *   - On unmount the state is gone — no persistence across navigations.
 *   - The "Hide" button clears state explicitly for users who want to
 *     dismiss the value while remaining on the page.
 */
import { BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { useConnection } from "@solana/wallet-adapter-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useVaulticProgram } from "@/lib/anchor";
import { humanizeError } from "@/lib/errorMessages";
import { formatLamportsSol } from "@/lib/format";
import { findEncryptCpiAuthority } from "@/lib/pda";
import type { EmployeeRecordAccount } from "@/hooks/useMyEmployee";

/** Safely parse a base58 pubkey from an env var; fall back to `default`. */
function envPubkey(value: string | undefined): PublicKey {
  if (!value) return PublicKey.default;
  try {
    return new PublicKey(value);
  } catch {
    return PublicKey.default;
  }
}

/**
 * Convert an IDL-decoded `[u8; 32]` ciphertext pubkey reference back into
 * a real `PublicKey`. Anchor decodes fixed-size byte arrays as `number[]`.
 */
function bytesToPublicKey(bytes: number[] | Uint8Array): PublicKey {
  return new PublicKey(Uint8Array.from(bytes as number[]));
}

const POLL_INTERVAL_MS = 5_000;
/** 15 minutes / 5 s = 180 iterations. */
const MAX_POLL_ATTEMPTS = 180;

/**
 * Sleep promise — used between polls so the mutation function remains a
 * simple linear async flow.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check whether the Encrypt-owned `DecryptionRequest` account has been
 * fully written by the decryptor. The account layout puts the two
 * counters at:
 *   - offset 99: `total_len`     (u32 LE)
 *   - offset 103: `bytes_written` (u32 LE)
 * Returns `true` once `bytes_written >= total_len` and `total_len > 0`.
 * A freshly-initialised account (where neither field is set yet) reads
 * as `0/0` and is treated as "not ready".
 */
async function isDecryptionReady(
  connection: ReturnType<typeof useConnection>["connection"],
  requestPda: PublicKey,
): Promise<boolean> {
  const account = await connection.getAccountInfo(requestPda, "confirmed");
  if (!account || account.data.length < 107) return false;
  const buffer = Buffer.from(account.data);
  const totalLen = buffer.readUInt32LE(99);
  const bytesWritten = buffer.readUInt32LE(103);
  return totalLen > 0 && bytesWritten >= totalLen;
}

/**
 * Decode the base64 return-data payload from a fetched transaction.
 * Anchor's `reveal_salary` emits exactly 8 bytes: the u64 salary in
 * little-endian. We parse through `BN` so values close to the u64 limit
 * survive without precision loss.
 */
function parseSalaryReturnData(base64Payload: string): BN {
  const raw = Buffer.from(base64Payload, "base64");
  if (raw.length < 8) {
    throw new Error("Unexpected return-data length from reveal_salary");
  }
  // `BN(buffer, 'le')` interprets the first 8 bytes as a u64 LE.
  return new BN(raw.subarray(0, 8), undefined, "le");
}

type RevealState =
  | { kind: "idle" }
  | { kind: "requesting" }
  | { kind: "polling"; attempt: number }
  | { kind: "revealing" }
  | { kind: "revealed"; salary: BN };

export interface DecryptSalaryButtonProps {
  employee: EmployeeRecordAccount;
  employeePda: PublicKey;
  treasuryPda: PublicKey;
}

export function DecryptSalaryButton({
  employee,
  employeePda,
  treasuryPda,
}: DecryptSalaryButtonProps) {
  const program = useVaulticProgram();
  const { connection } = useConnection();
  const queryClient = useQueryClient();
  const [state, setState] = useState<RevealState>({ kind: "idle" });

  const mutation = useMutation({
    mutationFn: async (): Promise<BN> => {
      if (!program) throw new Error("Wallet is not connected");
      if (!employee.isActive) {
        throw new Error("This employee account is inactive");
      }

      const ctSalary = bytesToPublicKey(
        employee.encryptedSalary as unknown as number[],
      );
      const [, cpiAuthorityBump] = findEncryptCpiAuthority(program.programId);

      // Fresh keypair — the Encrypt CPI inits this as the
      // `DecryptionRequest` account during the first call.
      const decryptionRequestKp = Keypair.generate();

      // Env-resolved Encrypt program accounts. Missing env → default
      // pubkey; the on-chain program rejects this loudly.
      const encryptProgram = envPubkey(
        process.env.NEXT_PUBLIC_ENCRYPT_PROGRAM_ID,
      );
      const encryptConfig = envPubkey(
        process.env.NEXT_PUBLIC_ENCRYPT_CONFIG,
      );
      const encryptDeposit = envPubkey(
        process.env.NEXT_PUBLIC_ENCRYPT_DEPOSIT,
      );
      const networkEncryptionKey = envPubkey(
        process.env.NEXT_PUBLIC_ENCRYPT_NETWORK_KEY,
      );
      const eventAuthority = envPubkey(
        process.env.NEXT_PUBLIC_ENCRYPT_EVENT_AUTHORITY,
      );

      // ── Step 1: request decryption ──────────────────────────────────
      setState({ kind: "requesting" });
      await program.methods
        .requestSalaryDecryption(cpiAuthorityBump)
        .accountsPartial({
          employeeRecord: employeePda,
          treasury: treasuryPda,
          decryptionRequest: decryptionRequestKp.publicKey,
          ctSalary,
          encryptProgram,
          config: encryptConfig,
          deposit: encryptDeposit,
          callerProgram: program.programId,
          networkEncryptionKey,
          eventAuthority,
        })
        .signers([decryptionRequestKp])
        .rpc();

      // ── Step 2: poll until the decryptor finishes writing ───────────
      let ready = false;
      for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
        setState({ kind: "polling", attempt });
        // eslint-disable-next-line no-await-in-loop -- sequential polling is the point
        ready = await isDecryptionReady(
          connection,
          decryptionRequestKp.publicKey,
        );
        if (ready) break;
        // eslint-disable-next-line no-await-in-loop
        await sleep(POLL_INTERVAL_MS);
      }
      if (!ready) {
        throw new Error(
          "Decryption timed out — the decryptor hasn't committed yet. Please try again later.",
        );
      }

      // ── Step 3: call reveal_salary and pull return-data ─────────────
      setState({ kind: "revealing" });
      const signature = await program.methods
        .revealSalary()
        .accountsPartial({
          employeeRecord: employeePda,
          treasury: treasuryPda,
          decryptionRequest: decryptionRequestKp.publicKey,
        })
        .rpc();

      // Wait for confirmation, then pull the full tx envelope (including
      // return-data). `getTransaction` may briefly return null while the
      // RPC replica catches up after a `confirmed` commitment — retry a
      // handful of times before giving up.
      let txInfo: Awaited<ReturnType<typeof connection.getTransaction>> = null;
      for (let attempt = 0; attempt < 10 && txInfo === null; attempt += 1) {
        // eslint-disable-next-line no-await-in-loop
        txInfo = await connection.getTransaction(signature, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        });
        if (txInfo === null) {
          // eslint-disable-next-line no-await-in-loop
          await sleep(500);
        }
      }
      const returnData = (
        txInfo?.meta as unknown as {
          returnData?: { data?: [string, string]; programId?: string };
        } | null | undefined
      )?.returnData?.data;
      if (!returnData || !returnData[0]) {
        throw new Error(
          "reveal_salary succeeded but no return-data was captured. Try again.",
        );
      }
      // Solana encodes returnData as [base64Payload, encoding]. We take
      // the payload string at index 0.
      return parseSalaryReturnData(returnData[0]);
    },
    onSuccess: (salary) => {
      setState({ kind: "revealed", salary });
      // Invalidate the employee record — `pending_digest` was cleared
      // on-chain so the decoded account view is now out of date.
      queryClient.invalidateQueries({ queryKey: ["myEmployee"] });
    },
    onError: (err) => {
      setState({ kind: "idle" });
      toast.error("Could not reveal salary", {
        description: humanizeError(err),
      });
    },
  });

  // Rendered label reflects the state machine so the button telegraphs
  // progress through the multi-minute poll window.
  let label = "Reveal Salary";
  if (state.kind === "requesting") label = "Requesting...";
  else if (state.kind === "polling") {
    const secondsElapsed = state.attempt * (POLL_INTERVAL_MS / 1000);
    const minutesElapsed = Math.floor(secondsElapsed / 60);
    label =
      minutesElapsed === 0
        ? "Waiting for decryptor..."
        : `Waiting for decryptor (${minutesElapsed}m)...`;
  } else if (state.kind === "revealing") label = "Reading plaintext...";

  if (state.kind === "revealed") {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/10 p-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Your Salary
          </p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {formatLamportsSol(state.salary)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Visible only in this session. Closing or navigating away will
            clear the value — no copy is persisted anywhere.
          </p>
        </div>
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setState({ kind: "idle" })}
          >
            Hide
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending || !employee.isActive}
    >
      {label}
    </Button>
  );
}
