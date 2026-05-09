/**
 * Plaintext-first transaction builders for Vaultic mutations.
 *
 * Each builder generates the required Fresh_Ciphertext_Keypairs, builds the
 * Anchor instruction with the correct account layout, and returns both the
 * `Transaction` and the `Keypair[]` array so the caller can pass the keypairs
 * to `wallet.sendTransaction(tx, connection, { signers: freshKeypairs })`.
 *
 * SECURITY (Req 9.11, 9.12):
 * - Plaintext amounts are written ONLY to the Anchor instruction data.
 * - They are NEVER written to console, localStorage, sessionStorage, or any
 *   analytics endpoint.
 * - The returned `Keypair[]` must be consumed by `sendTransaction` and then
 *   dropped — callers must not persist the private keys.
 *
 * encrypt-integration Req 1.4, Req 2.1–2.6, design §3.3.4
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import type { WalletContextState } from '@solana/wallet-adapter-react';
import { buildEncryptCpiAccounts, VAULTIC_PROGRAM_ID } from './cpiAccounts';
import type { EmployeePlaintextInputs } from './types';

// ── Anchor instruction discriminators ────────────────────────────────────
// These are the 8-byte Anchor discriminators for the new plaintext-first
// instructions. They are computed as sha256("global:<instruction_name>")[0..8].
// The actual values will be confirmed from the regenerated IDL after the
// devnet upgrade (Task 13). For now we use the Anchor derivation formula.

/**
 * Compute the 8-byte Anchor instruction discriminator for a given name.
 * Formula: sha256("global:<name>")[0..8]
 *
 * NOTE: This is a placeholder implementation. After the devnet upgrade and
 * IDL regeneration (Task 13), the discriminators should be read directly
 * from the IDL rather than computed here.
 */
async function anchorDiscriminator(name: string): Promise<Buffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`global:${name}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Buffer.from(hashBuffer).subarray(0, 8);
}

// ── Helper: build the 9-account Encrypt_CPI_Account_Block as AccountMeta[] ──

interface AccountMeta {
  pubkey: PublicKey;
  isSigner: boolean;
  isWritable: boolean;
}

async function buildEncryptAccountBlock(
  connection: Connection,
  payer: PublicKey,
): Promise<AccountMeta[]> {
  const enc = await buildEncryptCpiAccounts(connection, payer);
  return [
    { pubkey: enc.encryptProgram, isSigner: false, isWritable: false },
    { pubkey: enc.configPda, isSigner: false, isWritable: true },
    { pubkey: enc.depositPda, isSigner: false, isWritable: true },
    { pubkey: enc.cpiAuthority, isSigner: false, isWritable: false },
    { pubkey: enc.callerProgram, isSigner: false, isWritable: false },
    { pubkey: enc.networkKeyPda, isSigner: false, isWritable: false },
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: enc.eventAuthority, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
}

// ── register_employee ─────────────────────────────────────────────────────

export interface RegisterEmployeeParams {
  connection: Connection;
  wallet: WalletContextState;
  /** Treasury PDA public key. */
  treasury: PublicKey;
  /** Employee wallet public key. */
  employeeWallet: PublicKey;
  roleId: number;
  plaintexts: EmployeePlaintextInputs;
  vestingStart: bigint;
  vestingCliff: bigint;
  vestingDuration: bigint;
  totalAllocation: bigint;
  chainPreference: number;
  targetAddress: Uint8Array; // 64 bytes
}

export interface RegisterEmployeeResult {
  tx: Transaction;
  freshKeypairs: Keypair[];
}

/**
 * Build a `register_employee` transaction with plaintext-first flow.
 *
 * Generates three Fresh_Ciphertext_Keypairs (salary, bonus, performance),
 * builds the instruction with the nine Encrypt_CPI_Account_Block accounts,
 * and returns the transaction + keypairs.
 *
 * The caller MUST pass `freshKeypairs` to `wallet.sendTransaction` as
 * additional signers, then drop the keypairs immediately after.
 *
 * Req 2.1–2.6, Req 4.1–4.3
 */
export async function buildRegisterEmployeeTx(
  params: RegisterEmployeeParams,
): Promise<RegisterEmployeeResult> {
  const { connection, wallet, treasury, employeeWallet, roleId, plaintexts } = params;

  if (!wallet.publicKey) throw new Error('Wallet not connected');

  // Generate one fresh keypair per ciphertext slot (Req 2.1, 2.3).
  const ctSalary = Keypair.generate();
  const ctBonus = Keypair.generate();
  const ctPerformance = Keypair.generate();
  const freshKeypairs = [ctSalary, ctBonus, ctPerformance];

  // Derive the EmployeeRecord PDA.
  const [employeeRecord] = PublicKey.findProgramAddressSync(
    [Buffer.from('employee'), treasury.toBuffer(), employeeWallet.toBuffer()],
    VAULTIC_PROGRAM_ID,
  );

  // Get the Encrypt CPI accounts and cpiAuthorityBump.
  const enc = await buildEncryptCpiAccounts(connection, wallet.publicKey);
  const encryptBlock = await buildEncryptAccountBlock(connection, wallet.publicKey);

  // Build instruction data.
  // Layout: [discriminator(8) | employee_wallet(32) | cpi_authority_bump(1) |
  //          role_id(1) | salary_plaintext(8) | bonus_plaintext(8) |
  //          performance_plaintext(8) | vesting_start(8) | vesting_cliff(8) |
  //          vesting_duration(8) | total_allocation(8) | chain_preference(1) |
  //          target_address(64)]
  //
  // NOTE: The exact Anchor serialization order matches the handler signature.
  // After IDL regeneration (Task 13), use the Anchor client directly instead
  // of manual serialization.
  const disc = await anchorDiscriminator('register_employee');
  const data = Buffer.alloc(8 + 32 + 1 + 1 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 1 + 64);
  let offset = 0;
  disc.copy(data, offset); offset += 8;
  employeeWallet.toBuffer().copy(data, offset); offset += 32;
  data.writeUInt8(enc.cpiAuthorityBump, offset); offset += 1;
  data.writeUInt8(roleId, offset); offset += 1;
  data.writeBigUInt64LE(plaintexts.salary, offset); offset += 8;
  data.writeBigUInt64LE(plaintexts.bonus, offset); offset += 8;
  data.writeBigUInt64LE(plaintexts.performance, offset); offset += 8;
  data.writeBigInt64LE(params.vestingStart, offset); offset += 8;
  data.writeBigInt64LE(params.vestingCliff, offset); offset += 8;
  data.writeBigInt64LE(params.vestingDuration, offset); offset += 8;
  data.writeBigUInt64LE(params.totalAllocation, offset); offset += 8;
  data.writeUInt8(params.chainPreference, offset); offset += 1;
  Buffer.from(params.targetAddress).copy(data, offset);

  const ix = new TransactionInstruction({
    programId: VAULTIC_PROGRAM_ID,
    data,
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },   // authority
      { pubkey: treasury, isSigner: false, isWritable: true },           // treasury
      { pubkey: employeeRecord, isSigner: false, isWritable: true },     // employee_record
      { pubkey: ctSalary.publicKey, isSigner: true, isWritable: true },  // ct_salary
      { pubkey: ctBonus.publicKey, isSigner: true, isWritable: true },   // ct_bonus
      { pubkey: ctPerformance.publicKey, isSigner: true, isWritable: true }, // ct_performance
      ...encryptBlock,
    ],
  });

  const tx = new Transaction().add(ix);
  return { tx, freshKeypairs };
}

// ── set_payroll_band_mins ─────────────────────────────────────────────────

export interface SetPayrollBandMinsParams {
  connection: Connection;
  wallet: WalletContextState;
  treasury: PublicKey;
  bandMinPlaintexts: [bigint, bigint, bigint, bigint, bigint];
}

export interface SetPayrollBandMinsResult {
  tx: Transaction;
  freshKeypairs: Keypair[];
}

/**
 * Build a `set_payroll_band_mins` transaction.
 * Generates five Fresh_Ciphertext_Keypairs for the five band_min slots.
 */
export async function buildSetPayrollBandMinsTx(
  params: SetPayrollBandMinsParams,
): Promise<SetPayrollBandMinsResult> {
  const { connection, wallet, treasury, bandMinPlaintexts } = params;
  if (!wallet.publicKey) throw new Error('Wallet not connected');

  const freshKeypairs = Array.from({ length: 5 }, () => Keypair.generate());
  const enc = await buildEncryptCpiAccounts(connection, wallet.publicKey);
  const encryptBlock = await buildEncryptAccountBlock(connection, wallet.publicKey);

  const [payrollConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from('payroll_config'), treasury.toBuffer()],
    VAULTIC_PROGRAM_ID,
  );

  const disc = await anchorDiscriminator('set_payroll_band_mins');
  // Layout: [disc(8) | cpi_authority_bump(1) | band_min_plaintexts([u64;5] = 40)]
  const data = Buffer.alloc(8 + 1 + 40);
  disc.copy(data, 0);
  data.writeUInt8(enc.cpiAuthorityBump, 8);
  for (let i = 0; i < 5; i++) {
    data.writeBigUInt64LE(bandMinPlaintexts[i], 9 + i * 8);
  }

  const ix = new TransactionInstruction({
    programId: VAULTIC_PROGRAM_ID,
    data,
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: treasury, isSigner: false, isWritable: false },
      { pubkey: payrollConfig, isSigner: false, isWritable: true },
      ...freshKeypairs.map((kp) => ({ pubkey: kp.publicKey, isSigner: true, isWritable: true })),
      ...encryptBlock,
    ],
  });

  return { tx: new Transaction().add(ix), freshKeypairs };
}

// ── set_payroll_band_maxs ─────────────────────────────────────────────────

export interface SetPayrollBandMaxsParams {
  connection: Connection;
  wallet: WalletContextState;
  treasury: PublicKey;
  bandMaxPlaintexts: [bigint, bigint, bigint, bigint, bigint];
}

export async function buildSetPayrollBandMaxsTx(
  params: SetPayrollBandMaxsParams,
): Promise<{ tx: Transaction; freshKeypairs: Keypair[] }> {
  const { connection, wallet, treasury, bandMaxPlaintexts } = params;
  if (!wallet.publicKey) throw new Error('Wallet not connected');

  const freshKeypairs = Array.from({ length: 5 }, () => Keypair.generate());
  const enc = await buildEncryptCpiAccounts(connection, wallet.publicKey);
  const encryptBlock = await buildEncryptAccountBlock(connection, wallet.publicKey);

  const [payrollConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from('payroll_config'), treasury.toBuffer()],
    VAULTIC_PROGRAM_ID,
  );

  const disc = await anchorDiscriminator('set_payroll_band_maxs');
  const data = Buffer.alloc(8 + 1 + 40);
  disc.copy(data, 0);
  data.writeUInt8(enc.cpiAuthorityBump, 8);
  for (let i = 0; i < 5; i++) {
    data.writeBigUInt64LE(bandMaxPlaintexts[i], 9 + i * 8);
  }

  const ix = new TransactionInstruction({
    programId: VAULTIC_PROGRAM_ID,
    data,
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: treasury, isSigner: false, isWritable: false },
      { pubkey: payrollConfig, isSigner: false, isWritable: true },
      ...freshKeypairs.map((kp) => ({ pubkey: kp.publicKey, isSigner: true, isWritable: true })),
      ...encryptBlock,
    ],
  });

  return { tx: new Transaction().add(ix), freshKeypairs };
}

// ── set_payroll_threshold ─────────────────────────────────────────────────

export interface SetPayrollThresholdParams {
  connection: Connection;
  wallet: WalletContextState;
  treasury: PublicKey;
  performanceThresholdPlaintext: bigint;
  bonusMultiplierBps: number;
}

export async function buildSetPayrollThresholdTx(
  params: SetPayrollThresholdParams,
): Promise<{ tx: Transaction; freshKeypairs: Keypair[] }> {
  const { connection, wallet, treasury, performanceThresholdPlaintext, bonusMultiplierBps } = params;
  if (!wallet.publicKey) throw new Error('Wallet not connected');

  const ctPerfThreshold = Keypair.generate();
  const freshKeypairs = [ctPerfThreshold];
  const enc = await buildEncryptCpiAccounts(connection, wallet.publicKey);
  const encryptBlock = await buildEncryptAccountBlock(connection, wallet.publicKey);

  const [payrollConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from('payroll_config'), treasury.toBuffer()],
    VAULTIC_PROGRAM_ID,
  );

  const disc = await anchorDiscriminator('set_payroll_threshold');
  // Layout: [disc(8) | cpi_authority_bump(1) | performance_threshold_plaintext(8) | bonus_multiplier_bps(2)]
  const data = Buffer.alloc(8 + 1 + 8 + 2);
  disc.copy(data, 0);
  data.writeUInt8(enc.cpiAuthorityBump, 8);
  data.writeBigUInt64LE(performanceThresholdPlaintext, 9);
  data.writeUInt16LE(bonusMultiplierBps, 17);

  const ix = new TransactionInstruction({
    programId: VAULTIC_PROGRAM_ID,
    data,
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: treasury, isSigner: false, isWritable: false },
      { pubkey: payrollConfig, isSigner: false, isWritable: true },
      { pubkey: ctPerfThreshold.publicKey, isSigner: true, isWritable: true },
      ...encryptBlock,
    ],
  });

  return { tx: new Transaction().add(ix), freshKeypairs };
}

// ── submit_claim ──────────────────────────────────────────────────────────

export interface SubmitClaimParams {
  connection: Connection;
  wallet: WalletContextState;
  treasury: PublicKey;
  employeeRecord: PublicKey;
  policy: PublicKey;
  amount: bigint;
  claimTimestamp: bigint;
}

/**
 * Build a `submit_claim` transaction.
 *
 * No Fresh_Ciphertext_Keypairs are needed — `ClaimRecord.amount_claimed` is
 * a plaintext u64 (design §2.5, Req 12.5). Returns an empty `freshKeypairs`
 * array for API consistency.
 */
export async function buildSubmitClaimTx(
  params: SubmitClaimParams,
): Promise<{ tx: Transaction; freshKeypairs: Keypair[] }> {
  const { wallet, treasury, employeeRecord, policy, amount, claimTimestamp } = params;
  if (!wallet.publicKey) throw new Error('Wallet not connected');

  const [claimRecord] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('claim'),
      wallet.publicKey.toBuffer(),
      treasury.toBuffer(),
      (() => {
        const b = Buffer.alloc(8);
        b.writeBigInt64LE(claimTimestamp);
        return b;
      })(),
    ],
    VAULTIC_PROGRAM_ID,
  );

  const disc = await anchorDiscriminator('submit_claim');
  const data = Buffer.alloc(8 + 8 + 8);
  disc.copy(data, 0);
  data.writeBigUInt64LE(amount, 8);
  data.writeBigInt64LE(claimTimestamp, 16);

  const ix = new TransactionInstruction({
    programId: VAULTIC_PROGRAM_ID,
    data,
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: treasury, isSigner: false, isWritable: false },
      { pubkey: employeeRecord, isSigner: false, isWritable: false },
      { pubkey: policy, isSigner: false, isWritable: false },
      { pubkey: claimRecord, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
  });

  return { tx: new Transaction().add(ix), freshKeypairs: [] };
}
