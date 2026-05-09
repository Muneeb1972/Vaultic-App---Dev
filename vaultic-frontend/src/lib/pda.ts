/**
 * PDA derivation helpers — mirror the seed layouts in
 * `vaultic-contracts/programs/vaultic/src/state/**` and the IDL's `pda`
 * descriptors (Task 26).
 *
 * We derive on the client so screens can link to explorer URLs and wire
 * instruction accounts without round-tripping the program for every PDA.
 * Every helper returns `[PublicKey, bump]` — callers that only need the
 * address should destructure `const [pda] = findX(...)`.
 *
 * Seed encoding:
 *   - ASCII prefixes are produced via `TextEncoder` so we never rely on
 *     `Buffer.from('treasury')` semantics (which differ slightly between
 *     Node and the browser once polyfills are involved).
 *   - BN inputs are little-endian-encoded with `toArrayLike(Buffer, 'le', 8)`
 *     to match the Rust `u64.to_le_bytes()` / `i64.to_le_bytes()` seeds.
 */
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

const textEncoder = new TextEncoder();

/** Encode an ASCII seed prefix as a `Buffer` the Solana SDK can consume. */
function seed(prefix: string): Buffer {
  return Buffer.from(textEncoder.encode(prefix));
}

/** Encode a `u64`/`i64` seed in little-endian order, matching Anchor. */
function u64Seed(value: BN): Buffer {
  return value.toArrayLike(Buffer, "le", 8);
}

/**
 * Treasury seeds: `[b"treasury", authority]`.
 */
export function findTreasuryPda(
  authority: PublicKey,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [seed("treasury"), authority.toBuffer()],
    programId,
  );
}

/**
 * Employee seeds: `[b"employee", treasury, employee_wallet]`.
 */
export function findEmployeePda(
  treasury: PublicKey,
  employeeWallet: PublicKey,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [seed("employee"), treasury.toBuffer(), employeeWallet.toBuffer()],
    programId,
  );
}

/**
 * PayrollConfig seeds: `[b"payroll_config", treasury]`.
 */
export function findPayrollConfigPda(
  treasury: PublicKey,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [seed("payroll_config"), treasury.toBuffer()],
    programId,
  );
}

/**
 * PayrollExecution seeds: `[b"payroll_exec", treasury, execution_id.to_le_bytes()]`.
 */
export function findPayrollExecPda(
  treasury: PublicKey,
  executionId: BN,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [seed("payroll_exec"), treasury.toBuffer(), u64Seed(executionId)],
    programId,
  );
}

/**
 * Policy seeds: `[b"policy", treasury, policy_id.to_le_bytes()]`.
 */
export function findPolicyPda(
  treasury: PublicKey,
  policyId: BN,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [seed("policy"), treasury.toBuffer(), u64Seed(policyId)],
    programId,
  );
}

/**
 * Proposal seeds: `[b"proposal", treasury, nonce.to_le_bytes()]`.
 */
export function findProposalPda(
  treasury: PublicKey,
  nonce: BN,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [seed("proposal"), treasury.toBuffer(), u64Seed(nonce)],
    programId,
  );
}

/**
 * Encrypt CPI authority seeds: `[b"__encrypt_cpi_authority"]`.
 *
 * Derived on the vaultic program id — this PDA is how the Encrypt program
 * authenticates CPI calls from vaultic. The bump is passed as an instruction
 * arg to `execute_payroll_computation` and friends.
 */
export function findEncryptCpiAuthority(
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [seed("__encrypt_cpi_authority")],
    programId,
  );
}

/**
 * Ika CPI authority seeds: `[b"__ika_cpi_authority"]`.
 *
 * Mirrors `ika::IKA_CPI_AUTHORITY_SEED` in the contracts. Only needed for
 * the Ika-bound approvals (`approve_payroll_message`, `process_claim`).
 */
export function findIkaCpiAuthority(
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [seed("__ika_cpi_authority")],
    programId,
  );
}

/**
 * ClaimRecord seeds: `[b"claim", employee, treasury, claim_timestamp.to_le_bytes()]`.
 *
 * `claim_timestamp` is the client-supplied `i64` used to disambiguate
 * multiple claims by the same employee (design §3.1.1.13, Req 9.1). The
 * caller usually passes `new BN(Math.floor(Date.now() / 1000))`.
 */
export function findClaimPda(
  employee: PublicKey,
  treasury: PublicKey,
  claimTimestamp: BN,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      seed("claim"),
      employee.toBuffer(),
      treasury.toBuffer(),
      u64Seed(claimTimestamp),
    ],
    programId,
  );
}
