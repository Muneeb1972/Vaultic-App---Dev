//! Error codes — 18 variants per design §3.1.5.
//!
//! The variant order matches the design document so Anchor's auto-generated
//! numeric codes (6000 + ordinal) stay stable across builds. 15 variants are
//! requirement-mandated; 3 are implementation helpers called out inline.
//!
//! The `Unauthorized` variant is reused across Reqs 1.4, 3.4, 5.8, and 6.4.

use anchor_lang::prelude::*;

#[error_code]
pub enum VaulticError {
    // ---- Requirement-mandated ----
    /// Reqs 1.4, 3.4, 5.8, 6.4 — caller wallet mismatches the required
    /// authority or owning signer.
    #[msg("Caller is not authorized")]
    Unauthorized,

    /// Req 1.6 — treasury `is_active` is `false` (only `update_treasury`
    /// remains callable).
    #[msg("Treasury is inactive")]
    TreasuryInactive,

    /// Reqs 5.9, 9.6 — `EmployeeRecord.is_active` is `false`.
    #[msg("Employee is inactive")]
    EmployeeInactive,

    /// Req 2.7 — `role_id` outside the Junior..=Executive range.
    #[msg("Role id must be between 0 and 4")]
    InvalidRoleId,

    /// Req 2.8 — `chain_preference` outside the Solana..=Bitcoin range.
    #[msg("Chain preference must be between 0 and 2")]
    InvalidChainPreference,

    /// Req 4.2 — `now - last_payroll_timestamp < payroll_interval`.
    #[msg("Payroll interval has not elapsed")]
    PayrollIntervalNotElapsed,

    /// Req 4.11 — Encrypt CPI returned an error or the output ciphertext
    /// failed the `is_committed` check in `finalize_payroll`.
    #[msg("FHE execution failed")]
    FHEExecutionFailed,

    /// Reqs 5.6, 5.7 — decryptor hasn't finished writing, or the stored
    /// `pending_digest` disagrees with the `DecryptionRequest` ciphertext
    /// digest (stale-value protection).
    #[msg("Decryption request is not complete or digest mismatch")]
    DecryptionNotComplete,

    /// Req 8.3 — requested transfer amount exceeds the policy
    /// `spending_limit` or the treasury per-tx cap.
    #[msg("Spending limit exceeded")]
    SpendingLimitExceeded,

    /// Req 8.5 — fewer than `required_approvers` have signed the proposal.
    #[msg("Insufficient approvals")]
    InsufficientApprovals,

    /// Req 8.7 — `now - proposed_at < policy.time_lock`.
    #[msg("Time lock has not elapsed")]
    TimeLockNotElapsed,

    /// Req 8.8 — `PolicyAccount.is_active` is `false`.
    #[msg("Policy is inactive")]
    PolicyInactive,

    /// Req 9.4 — `amount > vested_amount - total_claimed`.
    #[msg("Claim amount exceeds vested balance")]
    ClaimExceedsVested,

    /// Req 9.5 — `now < vesting_start + vesting_cliff`.
    #[msg("Vesting cliff not reached")]
    VestingCliffNotReached,

    /// Req 7.5 — raw Ika CPI returned an error.
    #[msg("Ika signing failed")]
    IkaSigningFailed,

    // ---- Implementation-specific helpers ----
    /// Req 8.1 implementation guard — `required_approvers <= 5` and
    /// `required_approvers <= non_zero_approver_count`.
    #[msg("Invalid approver count")]
    InvalidApproverCount,

    /// Req 1.1 implementation guard — `name.len() > 64` (the `#[max_len(64)]`
    /// bound on `TreasuryConfig.name`).
    #[msg("Name exceeds maximum length")]
    NameTooLong,

    /// Req 4.9 / design §3.1.1.8 — `finalize_payroll` called on a
    /// `PayrollExecution` whose status is not `Processing`.
    #[msg("Payroll execution is not in a finalizable state")]
    InvalidPayrollState,

    /// encrypt-integration Req 4.7, Req 9.9 — a `create_plaintext_ciphertext`
    /// CPI into the Encrypt program failed for one of the Ciphertext_Slots.
    /// The frontend classifies this as `CtAccountCreationFailed` and displays
    /// "Encrypted account creation failed".
    ///
    /// Emitted by `register_employee` and `set_payroll_config` when any of
    /// the `EncryptContext::create_plaintext_u64` calls returns a
    /// `ProgramError`. No partial state is persisted to the calling PDA
    /// when this error is returned.
    #[msg("Encrypted ciphertext account creation failed")]
    CtAccountCreationFailed,
}
