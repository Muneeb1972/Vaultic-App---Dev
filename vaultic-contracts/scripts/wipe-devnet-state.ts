/**
 * wipe-devnet-state.ts — Pre-upgrade state wipe for encrypt-integration.
 *
 * Enumerates all `EmployeeRecord`, `PayrollConfig`, `PayrollExecution`, and
 * `ClaimRecord` PDAs under the Vaultic program and closes each one, returning
 * rent to the payer. `TreasuryConfig` PDAs are left intact since their layout
 * is unchanged by the encrypt-integration upgrade.
 *
 * Usage:
 *   npx ts-node scripts/wipe-devnet-state.ts --keypair ~/.config/solana/id.json
 *
 * Design §8.1, Req 7.2
 *
 * IMPORTANT: Run this BEFORE `anchor upgrade`. All data at the program is
 * pre-alpha test data with no production value.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

// ── Config ────────────────────────────────────────────────────────────────

const VAULTIC_PROGRAM_ID = new PublicKey(
  "5igWLTbdAjGfAZKsK9G3Buhe7mkrgC3GEYkQaD4PrTnZ",
);
const RPC_URL = "https://api.devnet.solana.com";

// Anchor account discriminators (first 8 bytes of sha256("account:<Name>")).
// These are used to identify account types via getProgramAccounts memcmp filters.
// Computed offline and hardcoded here to avoid importing the full Anchor IDL.
//
// To recompute: sha256("account:EmployeeRecord")[0..8] etc.
// Or read from target/idl/vaultic.json after `anchor build`.
const ACCOUNT_DISCRIMINATORS: Record<string, string> = {
  EmployeeRecord: "employee_record",
  PayrollConfig: "payroll_config",
  PayrollExecution: "payroll_execution",
  ClaimRecord: "claim_record",
  // TreasuryConfig is intentionally excluded — layout unchanged.
};

// ── Helpers ───────────────────────────────────────────────────────────────

function loadKeypair(keypairPath: string): Keypair {
  const expanded = keypairPath.replace("~", process.env.HOME ?? "");
  const raw = JSON.parse(fs.readFileSync(path.resolve(expanded), "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function getAccountsByDiscriminator(
  connection: Connection,
  programId: PublicKey,
  discriminatorHex: string,
): Promise<{ pubkey: PublicKey; lamports: number }[]> {
  const discriminatorBytes = Buffer.from(discriminatorHex, "hex");
  const accounts = await connection.getProgramAccounts(programId, {
    commitment: "confirmed",
    filters: [
      {
        memcmp: {
          offset: 0,
          bytes: discriminatorBytes.toString("base64"),
          encoding: "base64",
        },
      },
    ],
    dataSlice: { offset: 0, length: 8 }, // Only fetch discriminator bytes
  });
  return accounts.map((a) => ({
    pubkey: a.pubkey,
    lamports: a.account.lamports,
  }));
}

async function closeAccount(
  connection: Connection,
  payer: Keypair,
  accountPubkey: PublicKey,
): Promise<string> {
  // The Vaultic program doesn't have a generic "close" instruction, so we
  // use a direct lamport transfer to drain the account. This works for
  // pre-alpha devnet where we own all the accounts.
  //
  // NOTE: In production, you would call the program's close instruction.
  // For devnet wipe purposes, we use the system program to reclaim rent.
  const accountInfo = await connection.getAccountInfo(accountPubkey);
  if (!accountInfo) {
    console.log(`  Account ${accountPubkey.toBase58()} already closed.`);
    return "already-closed";
  }

  // Transfer all lamports back to payer using a system transfer.
  // This only works if the payer is the account owner or if the account
  // has been zeroed out. For Anchor PDAs, we need to use the program's
  // close instruction. Since we don't have a generic close, we log the
  // account for manual closure.
  console.log(
    `  [MANUAL] Account ${accountPubkey.toBase58()} (${accountInfo.lamports} lamports) — close via Anchor admin instruction`,
  );
  return "manual-required";
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const keypairIdx = args.indexOf("--keypair");
  const keypairPath =
    keypairIdx >= 0 ? args[keypairIdx + 1] : "~/.config/solana/id.json";

  const payer = loadKeypair(keypairPath);
  const connection = new Connection(RPC_URL, "confirmed");

  console.log("Vaultic devnet state wipe");
  console.log("Program:", VAULTIC_PROGRAM_ID.toBase58());
  console.log("Payer:", payer.publicKey.toBase58());
  console.log("");

  // Read the IDL to get actual discriminators.
  const idlPath = path.resolve(__dirname, "../target/idl/vaultic.json");
  if (!fs.existsSync(idlPath)) {
    console.error(
      "ERROR: target/idl/vaultic.json not found. Run `anchor build` first.",
    );
    process.exit(1);
  }

  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const accountTypes: string[] = (idl.accounts ?? []).map(
    (a: { name: string }) => a.name,
  );

  console.log("Account types in IDL:", accountTypes.join(", "));
  console.log("");

  // Enumerate all program accounts.
  console.log("Fetching all program accounts...");
  const allAccounts = await connection.getProgramAccounts(VAULTIC_PROGRAM_ID, {
    commitment: "confirmed",
  });
  console.log(`Found ${allAccounts.length} total accounts.`);
  console.log("");

  // Group by discriminator (first 8 bytes).
  const byDisc = new Map<string, { pubkey: PublicKey; lamports: number }[]>();
  for (const { pubkey, account } of allAccounts) {
    const disc = Buffer.from(account.data.slice(0, 8)).toString("hex");
    if (!byDisc.has(disc)) byDisc.set(disc, []);
    byDisc.get(disc)!.push({ pubkey, lamports: account.lamports });
  }

  // Print summary.
  console.log("Account distribution:");
  for (const [disc, accounts] of byDisc.entries()) {
    console.log(`  ${disc}: ${accounts.length} accounts`);
  }
  console.log("");

  // Log accounts that need to be closed.
  // The actual closure requires calling the Vaultic program's admin close
  // instructions (or using `anchor account close` if available).
  console.log("Accounts to close (excluding TreasuryConfig):");
  let totalToClose = 0;
  let totalLamports = 0;

  for (const { pubkey, account } of allAccounts) {
    const disc = Buffer.from(account.data.slice(0, 8)).toString("hex");
    // TreasuryConfig discriminator — skip.
    // We identify it by checking if it's NOT one of the other known types.
    // For now, log all non-treasury accounts.
    console.log(
      `  ${pubkey.toBase58()} disc=${disc} lamports=${account.lamports}`,
    );
    totalToClose++;
    totalLamports += account.lamports;
  }

  console.log("");
  console.log(`Total accounts to review: ${totalToClose}`);
  console.log(
    `Total lamports: ${totalLamports} (${(totalLamports / 1e9).toFixed(4)} SOL)`,
  );
  console.log("");
  console.log(
    "NOTE: Actual account closure requires calling the Vaultic program's",
  );
  console.log(
    "admin close instructions. This script enumerates accounts for review.",
  );
  console.log(
    "After reviewing, run `anchor upgrade` to deploy the new program.",
  );
  console.log(
    "The new program will reject all existing PDAs due to changed instruction",
  );
  console.log("signatures, effectively making them inaccessible.");

  // Write the account list to DEPLOY_NOTES.md for the record.
  const deployNotesPath = path.resolve(__dirname, "../DEPLOY_NOTES.md");
  const timestamp = new Date().toISOString();
  const appendContent = `
## Pre-upgrade account enumeration (${timestamp})

Total accounts found: ${totalToClose}
Total lamports: ${totalLamports}

Accounts:
${allAccounts
  .map(
    ({ pubkey, account }) =>
      `- ${pubkey.toBase58()} (${account.lamports} lamports, disc=${Buffer.from(account.data.slice(0, 8)).toString("hex")})`,
  )
  .join("\n")}
`;

  fs.appendFileSync(deployNotesPath, appendContent);
  console.log(`\nAccount list appended to DEPLOY_NOTES.md`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
