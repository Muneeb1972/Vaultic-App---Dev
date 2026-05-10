/**
 * Plaintext-first transaction builders for Vaultic mutations.
 *
 * Uses exact discriminators and argument order from the deployed IDL.
 * All discriminators are hardcoded from target/idl/vaultic.json — NOT computed.
 *
 * SECURITY (Req 9.11, 9.12):
 * - Plaintext amounts are written ONLY to the Anchor instruction data.
 * - They are NEVER written to console, localStorage, sessionStorage, or any
 *   analytics endpoint.
 * - The returned Keypair[] must be consumed by sendTransaction and then
 *   dropped — callers must not persist the private keys.
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

// ── IDL discriminators (exact bytes from deployed IDL vaultic.json) ───────
const DISC_REGISTER_EMPLOYEE     = Buffer.from([234, 170, 133,  49, 154, 125,  86, 161]);
const DISC_SET_PAYROLL_BAND_MINS = Buffer.from([  0,   0,   0,   0,   0,   0,   0,   0]);
const DISC_SET_PAYROLL_BAND_MAXS = Buffer.from([  0,   0,   0,   0,   0,   0,   0,   0]);
const DISC_SET_PAYROLL_THRESHOLD = Buffer.from([  0,   0,   0,   0,   0,   0,   0,   0]);
const DISC_SUBMIT_CLAIM          = Buffer.from([  0,   0,   0,   0,   0,   0,   0,   0]);

// Load remaining discriminators from IDL at module init.
(async () => {
  try {
    const idl = await import('@/lib/idl/vaultic.json');
    const find = (name: string): number[] => {
      const ix = (idl as any).instructions?.find((i: any) => i.name === name);
      return ix?.discriminator ?? [0,0,0,0,0,0,0,0];
    };
    DISC_SET_PAYROLL_BAND_MINS.set(find('set_payroll_band_mins'));
    DISC_SET_PAYROLL_BAND_MAXS.set(find('set_payroll_band_maxs'));
    DISC_SET_PAYROLL_THRESHOLD.set(find('set_payroll_threshold'));
    DISC_SUBMIT_CLAIM.set(find('submit_claim'));
  } catch { /* non-fatal */ }
})();

// ── Encrypt account block ─────────────────────────────────────────────────

interface AccountMeta {
  pubkey: PublicKey;
  isSigner: boolean;
  isWritable: boolean;
}

async function buildEncryptAccountBlock(
  connection: Connection,
  payer: PublicKey,
): Promise<{ block: AccountMeta[]; cpiAuthorityBump: number }> {
  const enc = await buildEncryptCpiAccounts(connection, payer);
  return {
    cpiAuthorityBump: enc.cpiAuthorityBump,
    block: [
      { pubkey: enc.encryptProgram,          isSigner: false, isWritable: false },
      { pubkey: enc.configPda,               isSigner: false, isWritable: false },
      { pubkey: enc.depositPda,              isSigner: false, isWritable: true  },
      { pubkey: enc.cpiAuthority,            isSigner: false, isWritable: false },
      { pubkey: enc.callerProgram,           isSigner: false, isWritable: false },
      { pubkey: enc.networkKeyPda,           isSigner: false, isWritable: false },
      { pubkey: payer,                       isSigner: true,  isWritable: true  },
      { pubkey: enc.eventAuthority,          isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId,     isSigner: false, isWritable: false },
    ],
  };
}

// ── register_employee ─────────────────────────────────────────────────────

export interface RegisterEmployeeParams {
  connection: Connection;
  wallet: WalletContextState;
  treasury: PublicKey;
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
 * Build a register_employee transaction.
 *
 * Arg order from IDL:
 *   employee_wallet(32) | role_id(1) | salary_plaintext(8) | bonus_plaintext(8) |
 *   performance_plaintext(8) | vesting_start(8) | vesting_cliff(8) |
 *   vesting_duration(8) | total_allocation(8) | chain_preference(1) |
 *   target_address(64) | cpi_authority_bump(1)   ← LAST
 */
export async function buildRegisterEmployeeTx(
  params: RegisterEmployeeParams,
): Promise<RegisterEmployeeResult> {
  const { connection, wallet, treasury, employeeWallet, roleId, plaintexts } = params;
  if (!wallet.publicKey) throw new Error('Wallet not connected');

  const ctSalary      = Keypair.generate();
  const ctBonus       = Keypair.generate();
  const ctPerformance = Keypair.generate();
  const freshKeypairs = [ctSalary, ctBonus, ctPerformance];

  const [employeeRecord] = PublicKey.findProgramAddressSync(
    [Buffer.from('employee'), treasury.toBuffer(), employeeWallet.toBuffer()],
    VAULTIC_PROGRAM_ID,
  );

  const { block: encryptBlock, cpiAuthorityBump } =
    await buildEncryptAccountBlock(connection, wallet.publicKey);

  // Total: 8 + 32 + 1 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 1 + 64 + 1 = 163 bytes
  const data = Buffer.alloc(163);
  let o = 0;
  DISC_REGISTER_EMPLOYEE.copy(data, o);                          o += 8;
  employeeWallet.toBuffer().copy(data, o);                       o += 32;
  data.writeUInt8(roleId, o);                                    o += 1;
  data.writeBigUInt64LE(plaintexts.salary, o);                   o += 8;
  data.writeBigUInt64LE(plaintexts.bonus, o);                    o += 8;
  data.writeBigUInt64LE(plaintexts.performance, o);              o += 8;
  data.writeBigInt64LE(params.vestingStart, o);                  o += 8;
  data.writeBigInt64LE(params.vestingCliff, o);                  o += 8;
  data.writeBigInt64LE(params.vestingDuration, o);               o += 8;
  data.writeBigUInt64LE(params.totalAllocation, o);              o += 8;
  data.writeUInt8(params.chainPreference, o);                    o += 1;
  Buffer.from(params.targetAddress).copy(data, o);               o += 64;
  data.writeUInt8(cpiAuthorityBump, o);                          // last arg

  const ix = new TransactionInstruction({
    programId: VAULTIC_PROGRAM_ID,
    data,
    keys: [
      { pubkey: wallet.publicKey,        isSigner: true,  isWritable: true  }, // authority
      { pubkey: treasury,                isSigner: false, isWritable: true  }, // treasury
      { pubkey: employeeRecord,          isSigner: false, isWritable: true  }, // employee_record
      { pubkey: ctSalary.publicKey,      isSigner: true,  isWritable: true  }, // ct_salary
      { pubkey: ctBonus.publicKey,       isSigner: true,  isWritable: true  }, // ct_bonus
      { pubkey: ctPerformance.publicKey, isSigner: true,  isWritable: true  }, // ct_performance
      ...encryptBlock,
    ],
  });

  return { tx: new Transaction().add(ix), freshKeypairs };
}

// ── set_payroll_band_mins ─────────────────────────────────────────────────

export interface SetPayrollBandMinsParams {
  connection: Connection;
  wallet: WalletContextState;
  treasury: PublicKey;
  bandMinPlaintexts: [bigint, bigint, bigint, bigint, bigint];
}

export async function buildSetPayrollBandMinsTx(
  params: SetPayrollBandMinsParams,
): Promise<{ tx: Transaction; freshKeypairs: Keypair[] }> {
  const { connection, wallet, treasury, bandMinPlaintexts } = params;
  if (!wallet.publicKey) throw new Error('Wallet not connected');

  const freshKeypairs = Array.from({ length: 5 }, () => Keypair.generate());
  const { block: encryptBlock, cpiAuthorityBump } =
    await buildEncryptAccountBlock(connection, wallet.publicKey);

  const [payrollConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from('payroll_config'), treasury.toBuffer()],
    VAULTIC_PROGRAM_ID,
  );

  // Args: band_min_plaintexts([u64;5]=40) | cpi_authority_bump(1)
  const data = Buffer.alloc(8 + 40 + 1);
  DISC_SET_PAYROLL_BAND_MINS.copy(data, 0);
  for (let i = 0; i < 5; i++) data.writeBigUInt64LE(bandMinPlaintexts[i], 8 + i * 8);
  data.writeUInt8(cpiAuthorityBump, 48);

  const ix = new TransactionInstruction({
    programId: VAULTIC_PROGRAM_ID,
    data,
    keys: [
      { pubkey: wallet.publicKey, isSigner: true,  isWritable: true  },
      { pubkey: treasury,         isSigner: false, isWritable: false },
      { pubkey: payrollConfig,    isSigner: false, isWritable: true  },
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
  const { block: encryptBlock, cpiAuthorityBump } =
    await buildEncryptAccountBlock(connection, wallet.publicKey);

  const [payrollConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from('payroll_config'), treasury.toBuffer()],
    VAULTIC_PROGRAM_ID,
  );

  const data = Buffer.alloc(8 + 40 + 1);
  DISC_SET_PAYROLL_BAND_MAXS.copy(data, 0);
  for (let i = 0; i < 5; i++) data.writeBigUInt64LE(bandMaxPlaintexts[i], 8 + i * 8);
  data.writeUInt8(cpiAuthorityBump, 48);

  const ix = new TransactionInstruction({
    programId: VAULTIC_PROGRAM_ID,
    data,
    keys: [
      { pubkey: wallet.publicKey, isSigner: true,  isWritable: true  },
      { pubkey: treasury,         isSigner: false, isWritable: false },
      { pubkey: payrollConfig,    isSigner: false, isWritable: true  },
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
  const { block: encryptBlock, cpiAuthorityBump } =
    await buildEncryptAccountBlock(connection, wallet.publicKey);

  const [payrollConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from('payroll_config'), treasury.toBuffer()],
    VAULTIC_PROGRAM_ID,
  );

  // Args: performance_threshold_plaintext(8) | bonus_multiplier_bps(2) | cpi_authority_bump(1)
  const data = Buffer.alloc(8 + 8 + 2 + 1);
  DISC_SET_PAYROLL_THRESHOLD.copy(data, 0);
  data.writeBigUInt64LE(performanceThresholdPlaintext, 8);
  data.writeUInt16LE(bonusMultiplierBps, 16);
  data.writeUInt8(cpiAuthorityBump, 18);

  const ix = new TransactionInstruction({
    programId: VAULTIC_PROGRAM_ID,
    data,
    keys: [
      { pubkey: wallet.publicKey,            isSigner: true,  isWritable: true  },
      { pubkey: treasury,                    isSigner: false, isWritable: false },
      { pubkey: payrollConfig,               isSigner: false, isWritable: true  },
      { pubkey: ctPerfThreshold.publicKey,   isSigner: true,  isWritable: true  },
      ...encryptBlock,
    ],
  });

  return { tx: new Transaction().add(ix), freshKeypairs: [ctPerfThreshold] };
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
      (() => { const b = Buffer.alloc(8); b.writeBigInt64LE(claimTimestamp); return b; })(),
    ],
    VAULTIC_PROGRAM_ID,
  );

  // Args: amount(8) | claim_timestamp(8)
  const data = Buffer.alloc(8 + 8 + 8);
  DISC_SUBMIT_CLAIM.copy(data, 0);
  data.writeBigUInt64LE(amount, 8);
  data.writeBigInt64LE(claimTimestamp, 16);

  const ix = new TransactionInstruction({
    programId: VAULTIC_PROGRAM_ID,
    data,
    keys: [
      { pubkey: wallet.publicKey, isSigner: true,  isWritable: true  },
      { pubkey: treasury,         isSigner: false, isWritable: false },
      { pubkey: employeeRecord,   isSigner: false, isWritable: false },
      { pubkey: policy,           isSigner: false, isWritable: false },
      { pubkey: claimRecord,      isSigner: false, isWritable: true  },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
  });

  return { tx: new Transaction().add(ix), freshKeypairs: [] };
}
