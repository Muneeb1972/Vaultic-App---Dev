/**
 * `ensureDeposit` — one-time Encrypt deposit PDA bootstrap.
 *
 * Checks whether the connected wallet's `depositPda` exists under the
 * Encrypt program. If absent, submits the `create_deposit` instruction
 * (discriminator 14) to create it.
 *
 * This is amortised once per wallet per session. The result is cached in
 * React state via the `useEnsureDeposit` hook.
 *
 * encrypt-integration Req 3.1–3.7, design §3.3.3
 *
 * ## Reference implementation
 * Mirrors `App.tsx#ensureDeposit` from `dwallet-labs/encrypt-pre-alpha`
 * byte-for-byte (discriminator 14, 18-byte data buffer, 8-account key list,
 * vault pubkey from bytes 100..132 of configPda with SystemProgram fallback).
 */

import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import type { WalletContextState } from '@solana/wallet-adapter-react';
import { buildEncryptCpiAccounts, ENCRYPT_PROGRAM_ID } from './cpiAccounts';
import { DepositEnsureFailedError, EncryptConfigMissingError } from './types';

/**
 * Ensure the connected wallet's Encrypt deposit PDA exists.
 *
 * - If the deposit PDA already exists: no-op (Req 3.3).
 * - If absent: submits `create_deposit` (disc 14) and waits for confirmation.
 *
 * @throws {EncryptConfigMissingError} if the Encrypt config PDA is not found.
 * @throws {DepositEnsureFailedError} on any failure (wallet rejection, RPC error, etc.).
 */
export async function ensureDeposit(
  connection: Connection,
  wallet: WalletContextState,
): Promise<void> {
  if (!wallet.publicKey || !wallet.sendTransaction) {
    throw new DepositEnsureFailedError(new Error('Wallet not connected'));
  }

  try {
    const enc = await buildEncryptCpiAccounts(connection, wallet.publicKey);

    // Check if the Encrypt config PDA exists (executor must be running).
    const configInfo = await connection.getAccountInfo(enc.configPda);
    if (!configInfo) {
      throw new EncryptConfigMissingError();
    }

    // Check if the deposit PDA already exists — no-op if so (Req 3.3).
    const depositInfo = await connection.getAccountInfo(enc.depositPda);
    if (depositInfo) {
      return;
    }

    // Read the vault pubkey from bytes 100..132 of the config PDA data (Req 3.6).
    // Fall back to the payer's own pubkey when the vault field equals SystemProgram.
    const configData = configInfo.data as Buffer;
    const encVault = new PublicKey(configData.subarray(100, 132));
    const vaultPk = encVault.equals(SystemProgram.programId) ? wallet.publicKey : encVault;

    // Build the `create_deposit` instruction (discriminator 14).
    // Data layout: [disc=14(1), depositBump(1), padding(16)] = 18 bytes total.
    const depositData = Buffer.alloc(18);
    depositData[0] = 14;
    depositData[1] = enc.depositBump;

    const ix = new TransactionInstruction({
      programId: ENCRYPT_PROGRAM_ID,
      data: depositData,
      keys: [
        { pubkey: enc.depositPda, isSigner: false, isWritable: true },
        { pubkey: enc.configPda, isSigner: false, isWritable: false },
        { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        {
          pubkey: vaultPk,
          isSigner: vaultPk.equals(wallet.publicKey),
          isWritable: true,
        },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
    });

    const tx = new Transaction().add(ix);
    const sig = await wallet.sendTransaction(tx, connection);
    await connection.confirmTransaction(sig, 'confirmed');
  } catch (err) {
    if (err instanceof EncryptConfigMissingError) throw err;
    // Wrap all other errors as DepositEnsureFailedError (Req 3.5).
    throw new DepositEnsureFailedError(err);
  }
}
