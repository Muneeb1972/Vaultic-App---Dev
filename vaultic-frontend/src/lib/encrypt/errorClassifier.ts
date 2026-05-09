/**
 * Error classification for plaintext-first submission failures.
 *
 * Maps raw errors from wallet adapters, RPC calls, and program simulations
 * to the four typed `EncryptionErrorType` values.
 *
 * encrypt-integration Req 9.6–9.10, design §6.1
 */

import type { EncryptPhase, EncryptionErrorType } from './types';
import {
  WalletRejectedError,
  DepositEnsureFailedError,
  CtAccountCreationFailedError,
} from './types';

/** Devnet Encrypt program ID (string form for log matching). */
const ENCRYPT_PROGRAM_ID_STR = '4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8';

/**
 * Encrypt program error codes that indicate a `create_plaintext_ciphertext`
 * failure (from `chains/solana/idl/encrypt_program.json`).
 *
 * Code 7: "Network key is not active"
 * Code 8: "Account is not an executable program"
 * Code 9: "Insufficient ENC token balance"
 */
const ENCRYPT_CT_CREATION_ERROR_CODES = new Set([7, 8, 9]);

/**
 * Classify a submission error into one of the four `EncryptionErrorType` values.
 *
 * @param err   The raw error thrown during submission.
 * @param phase The `EncryptPhase` active when the error occurred.
 * @returns     The classified `EncryptionErrorType`.
 */
export function classifyError(err: unknown, phase: EncryptPhase): EncryptionErrorType {
  // Already-typed errors from our own helpers.
  if (err instanceof WalletRejectedError) return 'WalletRejected';
  if (err instanceof DepositEnsureFailedError) return 'DepositEnsureFailed';
  if (err instanceof CtAccountCreationFailedError) return 'CtAccountCreationFailed';

  // Wallet adapter user-rejection (Req 9.7).
  if (isWalletUserRejection(err)) return 'WalletRejected';

  // Deposit-bootstrap phase (Req 9.8).
  if (phase.kind === 'EnsureDeposit') return 'DepositEnsureFailed';

  // Submitting phase: distinguish Encrypt CPI failures from Vaultic errors.
  if (phase.kind === 'Submitting') {
    if (isEncryptProgramError(err) || isCreatePlaintextFailure(err)) {
      return 'CtAccountCreationFailed';
    }
    return 'MutationFailed';
  }

  return 'MutationFailed';
}

/**
 * Return the user-facing error message for a classified error type.
 *
 * Req 9.7–9.10.
 */
export function errorMessage(type: EncryptionErrorType, rawErr?: unknown): string {
  switch (type) {
    case 'WalletRejected':
      return 'Wallet rejected the transaction';
    case 'DepositEnsureFailed':
      return 'Failed to set up encrypted deposit';
    case 'CtAccountCreationFailed':
      return 'Encrypted account creation failed';
    case 'MutationFailed':
      // Surface the decoded program error name if available.
      return decodeProgramError(rawErr) ?? 'Transaction failed';
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────

/**
 * Returns true if the error is a wallet adapter user-rejection.
 * Covers Phantom, Solflare, and the generic WalletSignTransactionError.
 */
function isWalletUserRejection(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const msg = (err as { message?: string }).message ?? '';
  return (
    msg.includes('User rejected') ||
    msg.includes('user rejected') ||
    msg.includes('Transaction cancelled') ||
    msg.includes('WalletSignTransactionError') ||
    (err as { name?: string }).name === 'WalletSignTransactionError'
  );
}

/**
 * Returns true if the error originates from the Encrypt program.
 * Checks simulation logs for the Encrypt program ID.
 */
function isEncryptProgramError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const logs: string[] = (err as { logs?: string[] }).logs ?? [];
  return logs.some((log) => log.includes(ENCRYPT_PROGRAM_ID_STR));
}

/**
 * Returns true if the error is specifically a `create_plaintext_ciphertext`
 * failure — identified by Encrypt error codes 7, 8, or 9 in the logs.
 */
function isCreatePlaintextFailure(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const logs: string[] = (err as { logs?: string[] }).logs ?? [];
  return logs.some((log) => {
    const match = log.match(/custom program error: 0x([0-9a-fA-F]+)/);
    if (!match) return false;
    const code = parseInt(match[1], 16);
    return ENCRYPT_CT_CREATION_ERROR_CODES.has(code);
  });
}

/**
 * Attempt to decode a Vaultic program error name from the simulation logs.
 * Returns the error name string if found, or null.
 */
function decodeProgramError(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const logs: string[] = (err as { logs?: string[] }).logs ?? [];
  for (const log of logs) {
    // Anchor error format: "Program log: AnchorError occurred. Error Code: <Name>."
    const match = log.match(/Error Code: (\w+)\./);
    if (match) return match[1];
  }
  return null;
}
