/**
 * Shared types for the Encrypt plaintext-first integration.
 *
 * encrypt-integration Req 9.1, Req 9.6, design §4.2
 */

// ── Encrypt_Phase ─────────────────────────────────────────────────────────

/**
 * The four user-visible stages of a plaintext-first submission.
 *
 * Req 9.1: EnsureDeposit, Submitting, Done, Error.
 */
export type EncryptPhase =
  | { kind: 'Idle' }
  | { kind: 'EnsureDeposit' }
  | { kind: 'Submitting'; label: string }
  | { kind: 'Done'; signature: string }
  | { kind: 'Error'; type: EncryptionErrorType; message: string };

// ── EncryptionErrorType ───────────────────────────────────────────────────

/**
 * The four typed error classes surfaced by a plaintext-first submission.
 *
 * Req 9.6: WalletRejected, DepositEnsureFailed, CtAccountCreationFailed,
 * MutationFailed.
 */
export type EncryptionErrorType =
  | 'WalletRejected'
  | 'DepositEnsureFailed'
  | 'CtAccountCreationFailed'
  | 'MutationFailed';

// ── PlaintextInputs ───────────────────────────────────────────────────────

/**
 * Plaintext SOL amounts for `register_employee`.
 * All values are in lamports (u64 range: 0 to 2^64 - 1).
 *
 * Using `bigint` to safely represent the full u64 range without precision
 * loss (JavaScript `number` is only safe up to 2^53 - 1).
 */
export interface EmployeePlaintextInputs {
  salary: bigint;       // lamports
  bonus: bigint;        // lamports
  performance: bigint;  // lamports
}

/**
 * Plaintext SOL amounts for `set_payroll_band_mins` / `set_payroll_band_maxs`.
 * Five values, one per role tier (Junior, Mid, Senior, Lead, Executive).
 */
export interface PayrollBandPlaintextInputs {
  bandMins: [bigint, bigint, bigint, bigint, bigint];  // lamports per tier
  bandMaxs: [bigint, bigint, bigint, bigint, bigint];  // lamports per tier
}

/**
 * Plaintext inputs for `set_payroll_threshold`.
 */
export interface PayrollThresholdPlaintextInputs {
  performanceThreshold: bigint;  // lamports
  bonusMultiplierBps: number;    // basis points (u16)
}

// ── Typed error classes ───────────────────────────────────────────────────

/** Wallet adapter returned a user-rejection error (Req 9.7). */
export class WalletRejectedError extends Error {
  readonly type = 'WalletRejected' as const;
  constructor() {
    super('Wallet rejected the transaction');
    this.name = 'WalletRejectedError';
  }
}

/** `ensureDeposit` failed (Req 9.8). */
export class DepositEnsureFailedError extends Error {
  readonly type = 'DepositEnsureFailed' as const;
  constructor(cause?: unknown) {
    super('Failed to set up encrypted deposit');
    this.name = 'DepositEnsureFailedError';
    if (cause) this.cause = cause;
  }
}

/** A `create_plaintext_ciphertext` CPI failed (Req 9.9). */
export class CtAccountCreationFailedError extends Error {
  readonly type = 'CtAccountCreationFailed' as const;
  constructor(cause?: unknown) {
    super('Encrypted account creation failed');
    this.name = 'CtAccountCreationFailedError';
    if (cause) this.cause = cause;
  }
}

/** The Vaultic mutation itself failed (Req 9.10). */
export class MutationFailedError extends Error {
  readonly type = 'MutationFailed' as const;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'MutationFailedError';
    if (cause) this.cause = cause;
  }
}

/** No active `NetworkEncryptionKey` account found on-chain. */
export class NoActiveNetworkKeyError extends Error {
  constructor() {
    super('No active NetworkEncryptionKey account found on the Encrypt program');
    this.name = 'NoActiveNetworkKeyError';
  }
}

/** Encrypt config PDA not found — executor may not be running. */
export class EncryptConfigMissingError extends Error {
  constructor() {
    super('Encrypt config not found. Is the executor running?');
    this.name = 'EncryptConfigMissingError';
  }
}
