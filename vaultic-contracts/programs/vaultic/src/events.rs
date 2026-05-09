//! On-chain events — 10 events per design §3.1.4.
//!
//! The 9 named events (`TreasuryInitialized`, `EmployeeRegistered`,
//! `EmployeeTerminated`, `PayrollExecutionStarted`, `PayrollExecutionCompleted`,
//! `FHEComputationRequested`, `IkaSigningRequested`, `ClaimSubmitted`,
//! `ClaimProcessed`) are consumed off-chain by the backend event listener
//! (`vaultic-backend/src/services/eventListener.ts`) via
//! `@coral-xyz/anchor`'s `EventParser`. Req 12.2 enumerates the audit set.
//!
//! `SalaryRevealed` is a tenth, signal-only event emitted by `reveal_salary`
//! (design §3.1.4 note, §3.1.1.10). **PRIVACY — Req 5.4:** it MUST carry no
//! plaintext amount; plaintext flows exclusively through `set_return_data`.

use anchor_lang::prelude::*;

use crate::state::ClaimStatus;

/// Emitted by `initialize_treasury` once the `TreasuryConfig` PDA is written
/// (Req 1.3).
#[event]
pub struct TreasuryInitialized {
    pub treasury: Pubkey,
    pub authority: Pubkey,
}

/// Emitted by `register_employee` once the `EmployeeRecord` PDA is written
/// (Req 2.6). `role_id` is included so downstream audit log projections can
/// surface the tier without reopening the account.
#[event]
pub struct EmployeeRegistered {
    pub treasury: Pubkey,
    pub employee: Pubkey,
    pub role_id: u8,
}

/// Emitted by `terminate_employee` when `is_active` flips to `false`
/// (Req 2.10, design §3.1.1.5).
#[event]
pub struct EmployeeTerminated {
    pub treasury: Pubkey,
    pub employee: Pubkey,
}

/// Emitted by `execute_payroll_computation` immediately after the Encrypt CPI
/// returns, marking the asynchronous FHE run as `Processing` (Req 4.10).
/// `started_at` anchors the interval gate per design §3.1.1.7.
#[event]
pub struct PayrollExecutionStarted {
    pub treasury: Pubkey,
    pub execution_id: u64,
    pub started_at: i64,
}

/// Emitted by `finalize_payroll` once the output ciphertext commit is
/// observed and the run transitions to `Completed` (Req 4.10, design
/// §3.1.1.8).
#[event]
pub struct PayrollExecutionCompleted {
    pub treasury: Pubkey,
    pub execution_id: u64,
    pub completed_at: i64,
}

/// Emitted alongside `PayrollExecutionStarted` to signal a new FHE graph
/// invocation (Req 4.10). `graph` names the `#[encrypt_fn]` being executed
/// (e.g. `"compute_total_payout"`) and `output_ct` is the destination
/// ciphertext pubkey the off-chain executor must write.
#[event]
pub struct FHEComputationRequested {
    pub treasury: Pubkey,
    pub graph: String,
    pub output_ct: Pubkey,
}

/// Emitted by `approve_payroll_message` and `process_claim` once the raw Ika
/// CPI returns successfully (Reqs 7.4, 9.3 via design §3.1.4). `message_hash`
/// is the keccak256 digest the MPC network will sign; `target_chain` uses the
/// same `0..=2` encoding as `EmployeeRecord.chain_preference`.
#[event]
pub struct IkaSigningRequested {
    pub treasury: Pubkey,
    pub message_hash: [u8; 32],
    pub target_chain: u8,
}

/// Emitted by `submit_claim` when a new `ClaimRecord` PDA is opened in
/// `Pending` (Req 9.3).
#[event]
pub struct ClaimSubmitted {
    pub employee: Pubkey,
    pub amount: u64,
    pub target_chain: u8,
}

/// Emitted by `process_claim` once the Ika signature lands and the
/// `ClaimRecord` transitions to `Executed` (Req 9.8). `ika_signature_hash`
/// is the keccak256 digest of the signature bytes, not the signature itself,
/// to keep the event payload bounded.
#[event]
pub struct ClaimProcessed {
    pub claim: Pubkey,
    pub status: ClaimStatus,
    pub ika_signature_hash: [u8; 32],
}

/// Signal-only event emitted by `reveal_salary` to notify indexers that a
/// plaintext salary was returned to the employee via `set_return_data`
/// (design §3.1.1.10). Carries **no plaintext amount** — Req 5.4 restricts
/// plaintext to the transaction return-data channel, which is visible only
/// to the caller's transaction context.
#[event]
pub struct SalaryRevealed {
    pub employee: Pubkey,
}

/// Emitted by `request_salary_decryption` immediately after the Encrypt CPI
/// returns with a fresh digest snapshot (Req 5.2, design §3.1.1.10). Carries
/// no ciphertext reference or digest so the event stream cannot be used to
/// correlate multiple decryption requests for the same employee beyond the
/// `employee` pubkey itself, which is already public treasury membership.
#[event]
pub struct DecryptionRequested {
    pub employee: Pubkey,
}
