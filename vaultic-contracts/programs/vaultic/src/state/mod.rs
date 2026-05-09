//! On-chain state — PDA account structs.
//!
//! This module defines all 7 persistent account types per design §3.1.2:
//! `TreasuryConfig`, `EmployeeRecord`, `PayrollConfig`, `PayrollExecution`,
//! `PolicyAccount`, `ClaimRecord`, and `TransactionProposal`. Each uses
//! `#[derive(InitSpace)]` so space is computed automatically at compile time
//! (consumed as `8 + <Type>::INIT_SPACE` by `#[account(init, space = ...)]`).
//!
//! Each PDA struct carries a `bump: u8` field per design §3.1.1.1 note:
//! Anchor 0.32 does **not** auto-persist stored bumps on `init`, so every
//! instruction that initializes one of these accounts MUST assign
//! `account.bump = ctx.bumps.account;` in its body.
//!
//! Requirements covered: 1.1, 2.1–2.4, 3.1–3.3, 4.3, 8.1, 9.1, 9.2, 24.4.
//!
//! Implementation: Task 3.1.

use anchor_lang::prelude::*;

// --------------------------------------------------------------------------
// Treasury — Reqs 1.1, 1.2, 6.1, 24.4
// --------------------------------------------------------------------------

/// Treasury configuration PDA.
///
/// Seeds: `[b"treasury", authority.key().as_ref()]`.
///
/// Created by `initialize_treasury` (Req 1.1), mutated by `update_treasury`
/// (Req 1.5) and `create_dwallet` (Req 6.1). `dwallet_curve_type` is stored
/// as a `u8` following the Ika on-chain discriminant encoding documented at
/// the bottom of this file (§3.1.2).
#[account]
#[derive(InitSpace)]
pub struct TreasuryConfig {
    /// Treasury administrator. Required signer for all admin instructions.
    pub authority: Pubkey,
    /// Pubkey of the dWallet account owned by the Ika program. Zeroed until
    /// `create_dwallet` binds it after the off-chain DKG ceremony (Req 6.1).
    pub dwallet_id: Pubkey,
    /// Curve discriminant for the bound dWallet (see `DWalletCurveType`
    /// encoding block at the bottom of this file).
    pub dwallet_curve_type: u8,
    /// Human-readable treasury name, capped at 64 bytes (Req 1.1).
    #[max_len(64)]
    pub name: String,
    /// Minimum seconds between successive payroll runs (Req 4.1).
    pub payroll_interval: i64,
    /// Per-transaction spending ceiling enforced by `enforce_spending_policy`
    /// (Req 8.9).
    pub spending_limit_per_tx: u64,
    /// Number of approvers required for a transaction proposal (Req 8.4,
    /// bounded to <= 5 by `InvalidApproverCount`).
    pub required_approvers: u8,
    /// Count of active employees. Incremented by `register_employee` (Req
    /// 2.5) and decremented by `terminate_employee` (Req 2.10).
    pub total_employees: u32,
    /// Start-time anchor of the most recent payroll run (Req 4.1 / 4.9).
    pub last_payroll_timestamp: i64,
    /// `false` blocks all instructions except `update_treasury` (Req 1.6).
    pub is_active: bool,
    /// Stored PDA bump (design §3.1.1.1 — must be assigned in init body).
    pub bump: u8,
}

// --------------------------------------------------------------------------
// Employee — Reqs 2.1–2.4
// --------------------------------------------------------------------------

/// Employee record PDA.
///
/// Seeds: `[b"employee", treasury.key().as_ref(), employee_wallet.as_ref()]`.
///
/// Encrypted compensation fields are stored as raw `[u8; 32]` ciphertext
/// pubkey references (Req 2.2), not as `Pubkey`, so they can be passed
/// verbatim to the Encrypt program without coercion.
#[account]
#[derive(InitSpace)]
pub struct EmployeeRecord {
    /// Parent treasury PDA (Req 2.1).
    pub treasury: Pubkey,
    /// Employee's Solana wallet — must sign `request_salary_decryption`,
    /// `reveal_salary`, and `submit_claim` (Reqs 5.8, 9.1).
    pub employee_wallet: Pubkey,
    /// Role tier 0..=4: Junior, Mid, Senior, Lead, Executive (Req 2.7).
    pub role_id: u8,
    /// Ciphertext pubkey reference for the encrypted salary (Req 2.2).
    pub encrypted_salary: [u8; 32],
    /// Ciphertext pubkey reference for the encrypted bonus (Req 2.2).
    pub encrypted_bonus: [u8; 32],
    /// Ciphertext pubkey reference for the encrypted performance score
    /// (Req 2.2). Used as an input to `compute_bonus_amount` (Req 4.6).
    pub encrypted_performance: [u8; 32],
    /// Unix timestamp when vesting starts (Req 2.3).
    pub vesting_start: i64,
    /// Cliff duration in seconds — no claim permitted before
    /// `vesting_start + vesting_cliff` (Req 9.5).
    pub vesting_cliff: i64,
    /// Total vesting duration in seconds (Req 4.7).
    pub vesting_duration: i64,
    /// Plaintext total token allocation used as input to
    /// `compute_vested_amount` (Req 2.3).
    pub total_allocation: u64,
    /// Cumulative amount claimed; gated by `ClaimExceedsVested` (Req 9.4).
    pub total_claimed: u64,
    /// Chain preference 0..=2: Solana, Ethereum, Bitcoin (Req 2.8).
    pub chain_preference: u8,
    /// Payout destination on the target chain (Req 2.4).
    pub target_address: [u8; 64],
    /// Snapshot digest of the last decryption request; zero = no request
    /// in flight (Reqs 5.2, 5.5, 5.7).
    pub pending_digest: [u8; 32],
    /// `false` blocks decryption and claim flows (Reqs 5.9, 9.6).
    pub is_active: bool,
    /// Stored PDA bump (design §3.1.1.1).
    pub bump: u8,
}

// --------------------------------------------------------------------------
// Payroll configuration — Reqs 3.1–3.3
// --------------------------------------------------------------------------

/// Payroll configuration PDA storing salary band references and bonus params.
///
/// Seeds: `[b"payroll_config", treasury.key().as_ref()]`.
///
/// The five `(min, max)` pairs correspond to the five role tiers from
/// `EmployeeRecord.role_id` (Req 3.2). `bonus_multiplier_bps` is stored as
/// plaintext `u16` (basis points) and lifted into the FHE graph via `PUint64`
/// by `compute_bonus_amount` (design §3.1.3) — no client-side encryption of
/// the multiplier is required.
#[account]
#[derive(InitSpace)]
pub struct PayrollConfig {
    /// Parent treasury PDA (Req 3.1).
    pub treasury: Pubkey,
    /// Minimum salary ciphertext references, indexed by role tier (Req 3.2).
    pub band_min: [[u8; 32]; 5],
    /// Maximum salary ciphertext references, indexed by role tier (Req 3.2).
    pub band_max: [[u8; 32]; 5],
    /// Ciphertext reference for the performance threshold used by the bonus
    /// gate (Req 3.3).
    pub performance_threshold: [u8; 32],
    /// Bonus multiplier in basis points (Req 3.3). Max practical value 10_000
    /// (= 100%).
    pub bonus_multiplier_bps: u16,
    /// Stored PDA bump (design §3.1.1.1).
    pub bump: u8,
}

// --------------------------------------------------------------------------
// Payroll execution — Req 4.3, 4.9–4.11, 8.9 (policy_digest)
// --------------------------------------------------------------------------

/// Lifecycle record for a single payroll run.
///
/// Seeds: `[b"payroll_exec", treasury.key().as_ref(), &execution_id.to_le_bytes()]`.
///
/// Opened in `Processing` state by `execute_payroll_computation` (Req 4.3)
/// and transitioned to `Completed` by `finalize_payroll` once the output
/// ciphertext commit is observed (Req 4.9). `Failed` is set on FHE error
/// (Req 4.11) or by the admin timeout escape hatch.
#[account]
#[derive(InitSpace)]
pub struct PayrollExecution {
    /// Parent treasury PDA.
    pub treasury: Pubkey,
    /// Monotonic execution counter chosen by the authority.
    pub execution_id: u64,
    /// Current lifecycle state.
    pub status: PayrollStatus,
    /// Block timestamp when the CPI to `execute_graph` returned.
    pub started_at: i64,
    /// Block timestamp when `finalize_payroll` ran (0 until then).
    pub completed_at: i64,
    /// Employees processed in this run (1 for the current per-employee
    /// execution model; see design §11 for batching roadmap).
    pub employees_processed: u32,
    /// Pubkey of the ciphertext account that receives the FHE output
    /// (`compute_total_payout`). Stored as raw bytes to match the
    /// ciphertext-ref convention used elsewhere.
    pub total_payout_ref: [u8; 32],
    /// Keccak256 digest of the Ika-signed payload (Req 7.3). Zero until
    /// `approve_payroll_message` stamps it.
    pub ika_message_hash: [u8; 32],
    /// Digest returned by the `request_decryption` CPI for the encrypted
    /// `check_policy_compliance` boolean (Req 8.9, design §3.1.1.12).
    pub policy_digest: [u8; 32],
    /// Stored PDA bump (design §3.1.1.1).
    pub bump: u8,
}

/// Payroll execution lifecycle discriminant.
///
/// Values are contiguous starting at 0 so the Borsh wire encoding is a single
/// byte and matches Anchor's native `ProgramError` convention.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, InitSpace)]
pub enum PayrollStatus {
    Pending,
    Processing,
    Completed,
    Failed,
}

// --------------------------------------------------------------------------
// Policy — Req 8.1
// --------------------------------------------------------------------------

/// Spending policy PDA enforced by `enforce_spending_policy` (Req 8.9) and
/// consulted by `approve_transaction` (Reqs 8.4–8.8).
///
/// Seeds: `[b"policy", treasury.key().as_ref(), &policy_id.to_le_bytes()]`.
///
/// `required_approvers` is bound to `<= 5` and `<= non_zero_approver_count`
/// at creation time (Req 8.1), else `InvalidApproverCount`.
#[account]
#[derive(InitSpace)]
pub struct PolicyAccount {
    /// Parent treasury PDA.
    pub treasury: Pubkey,
    /// Monotonic policy identifier chosen by the authority.
    pub policy_id: u64,
    /// Maximum transaction amount permitted by this policy (Req 8.2).
    pub spending_limit: u64,
    /// Seconds between `proposed_at` and the earliest legal execution time
    /// (Req 8.6). Zero disables the time lock.
    pub time_lock: i64,
    /// Number of approver signatures required (Req 8.4).
    pub required_approvers: u8,
    /// Fixed-size approver allowlist; unused slots are the zero Pubkey.
    pub approvers: [Pubkey; 5],
    /// `false` blocks `approve_transaction` (Req 8.8).
    pub is_active: bool,
    /// Stored PDA bump (design §3.1.1.1).
    pub bump: u8,
}

// --------------------------------------------------------------------------
// Claim — Reqs 9.1, 9.2
// --------------------------------------------------------------------------

/// Per-claim record tracking the Ika signing lifecycle of an employee payout.
///
/// Seeds: `[b"claim", employee.key().as_ref(), treasury.key().as_ref(), &claim_timestamp.to_le_bytes()]`.
///
/// Created in `Pending` state by `submit_claim` (Req 9.1) and finalized by
/// `process_claim` once the Ika MessageApproval reaches `Signed` (Req 9.7).
#[account]
#[derive(InitSpace)]
pub struct ClaimRecord {
    /// Employee wallet that submitted the claim.
    pub employee: Pubkey,
    /// Parent treasury PDA.
    pub treasury: Pubkey,
    /// Client-supplied timestamp used as a seed component for PDA uniqueness
    /// across multiple claims by the same employee (Req 9.1).
    pub claim_timestamp: i64,
    /// Amount being claimed (Req 9.2). Bounded by the employee's unclaimed
    /// vested amount — `ClaimExceedsVested` otherwise (Req 9.4).
    pub amount_claimed: u64,
    /// Snapshotted from `EmployeeRecord.chain_preference` at submit time
    /// (Req 9.2).
    pub target_chain: u8,
    /// Snapshotted from `EmployeeRecord.target_address` at submit time
    /// (Req 9.2).
    pub target_address: [u8; 64],
    /// Current lifecycle state.
    pub status: ClaimStatus,
    /// Keccak256 digest of the cross-chain message submitted to Ika.
    pub ika_message_hash: [u8; 32],
    /// Signature bytes returned by the Ika MPC network. Sized to 96 bytes
    /// to accommodate both ECDSA (r||s||v padded) and Ed25519 (64 bytes
    /// padded) encodings.
    pub ika_signature: [u8; 96],
    /// Stored PDA bump (design §3.1.1.1).
    pub bump: u8,
}

/// Claim lifecycle discriminant.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, InitSpace)]
pub enum ClaimStatus {
    Pending,
    IkaApproved,
    Executed,
    Failed,
}

// --------------------------------------------------------------------------
// Transaction proposal — Reqs 8.4–8.7
// --------------------------------------------------------------------------

/// Persistent proposal state for the multi-sig approval flow.
///
/// Seeds: `[b"proposal", treasury.key().as_ref(), &nonce.to_le_bytes()]`.
///
/// `approve_transaction` operates on this PDA; the `proposed_at` anchor is
/// what enables the time-lock check in Req 8.6, which is why a dedicated PDA
/// exists rather than passing the proposal by transient args.
#[account]
#[derive(InitSpace)]
pub struct TransactionProposal {
    /// Parent treasury PDA.
    pub treasury: Pubkey,
    /// Policy that governs this proposal's limits and approvers.
    pub policy: Pubkey,
    /// Monotonic proposal counter chosen by the proposer.
    pub nonce: u64,
    /// Wallet that submitted the proposal.
    pub proposer: Pubkey,
    /// Amount to be transferred on execution (Req 8.2 bound check).
    pub amount: u64,
    /// Destination wallet for the transfer.
    pub target: Pubkey,
    /// Block timestamp at submit time — anchors the time-lock gate (Req 8.6).
    pub proposed_at: i64,
    /// Positional acknowledgement from each approver in
    /// `PolicyAccount.approvers` (Req 8.4).
    pub approvers_signed: [bool; 5],
    /// Cached popcount of `approvers_signed`; must reach `required_approvers`
    /// before execution (Req 8.5).
    pub approval_count: u8,
    /// `true` once the proposal has been executed (single-shot guard).
    pub executed: bool,
    /// Stored PDA bump (design §3.1.1.1).
    pub bump: u8,
}

// --------------------------------------------------------------------------
// DWalletCurveType u8 encoding (design §3.1.2)
// --------------------------------------------------------------------------
//
// `TreasuryConfig.dwallet_curve_type` is stored as a plain `u8` (rather than a
// Rust `enum`) so the serialized width is exactly one byte and so unknown
// future Ika variants round-trip unmodified. The encoding mirrors Ika's
// on-chain `DWalletCurveType` discriminant:
//
//   0 = Secp256k1      (Ethereum, Bitcoin)
//   1 = Ed25519        (Solana, Sui)
//   2 = Ristretto25519 (future — privacy-preserving signatures)
//   3 = Reserved
//
// `create_dwallet` validates `curve_type <= 2`; higher values return
// `Unauthorized` (Req 6.4) until Ika publishes additional variants. Before
// mainnet, reconfirm this mapping against the Ika program's on-chain layout
// (design §12, open question 4).
