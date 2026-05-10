//! Employee claim instructions — Req 9.
//!
//! - `submit_claim` (Req 9.1–9.6): creates a `ClaimRecord` PDA in `Pending`
//!   after validating active status, vesting cliff, vested-amount bound,
//!   and the plaintext spending policy (Req 8.9).
//! - `process_claim` (Req 9.7–9.8): two-phase Ika signing flow.
//!
//! ## encrypt-integration design note (Task 10, design §2.5)
//!
//! `submit_claim` does NOT require a `create_plaintext_u64` CPI.
//! `ClaimRecord.amount_claimed` is a plaintext `u64` field — it is NOT a
//! Ciphertext_Slot. The claim amount is validated against the plaintext
//! vesting schedule and spending policy on-chain, then stored as a raw `u64`.
//! No Encrypt_CPI_Account_Block is needed on `submit_claim` transactions.
//!
//! Req 4.6 is satisfied by explicitly excluding `submit_claim` from the
//! instruction-change list (encrypt-integration Req 12.5 resolved).

use anchor_lang::prelude::*;

use crate::errors::VaulticError;
use crate::events::{ClaimSubmitted, IkaSigningRequested};
use crate::ika;
use crate::state::{ClaimRecord, ClaimStatus, EmployeeRecord, PolicyAccount, TreasuryConfig};

// --------------------------------------------------------------------------
// submit_claim — Req 9.1–9.6  (Task 11.3)
// --------------------------------------------------------------------------

/// Accounts for `submit_claim` (design §3.1.1.13).
///
/// `policy` is passed explicitly so the `enforce_spending_policy` gate
/// (Req 8.9) can check `amount <= policy.spending_limit` in addition to
/// the per-tx treasury cap. `has_one = treasury` on the policy ties the
/// policy to this treasury so a caller can't smuggle in an unrelated
/// policy with a higher limit.
#[derive(Accounts)]
#[instruction(amount: u64, claim_timestamp: i64)]
pub struct SubmitClaim<'info> {
    #[account(mut)]
    pub employee_wallet: Signer<'info>,

    pub treasury: Account<'info, TreasuryConfig>,

    #[account(
        has_one = treasury @ VaulticError::Unauthorized,
        has_one = employee_wallet @ VaulticError::Unauthorized,
    )]
    pub employee_record: Account<'info, EmployeeRecord>,

    #[account(has_one = treasury @ VaulticError::Unauthorized)]
    pub policy: Account<'info, PolicyAccount>,

    #[account(
        init,
        payer = employee_wallet,
        space = 8 + ClaimRecord::INIT_SPACE,
        seeds = [
            b"claim",
            employee_wallet.key().as_ref(),
            treasury.key().as_ref(),
            &claim_timestamp.to_le_bytes(),
        ],
        bump,
    )]
    pub claim_record: Account<'info, ClaimRecord>,

    pub system_program: Program<'info, System>,
}

/// Internal helper for Req 8.9 — the plaintext spending-policy gate
/// reused by `submit_claim` and (conceptually) the non-FHE branches of
/// future instructions. Encapsulated as a free `fn` so call-sites can
/// pass the `u64` fields directly without holding references to the
/// policy/treasury accounts.
///
/// Returns `Ok(())` iff `amount` is within both bounds. The
/// "evaluation order" — policy-limit first, treasury-limit second — is
/// asserted by property test P9 (Task 12.4).
fn enforce_spending_policy(amount: u64, policy_limit: u64, treasury_limit: u64) -> Result<()> {
    require!(amount <= policy_limit, VaulticError::SpendingLimitExceeded);
    require!(
        amount <= treasury_limit,
        VaulticError::SpendingLimitExceeded
    );
    Ok(())
}

pub fn submit_claim(ctx: Context<SubmitClaim>, amount: u64, claim_timestamp: i64) -> Result<()> {
    // Req 1.6 — inactive treasury blocks everything except `update_treasury`.
    require!(
        ctx.accounts.treasury.is_active,
        VaulticError::TreasuryInactive
    );
    // Req 8.8 — inactive policies cannot gate new claims.
    require!(ctx.accounts.policy.is_active, VaulticError::PolicyInactive);

    // Req 9.6 — active-employee gate (checked FIRST per design §3.1.1.13).
    require!(
        ctx.accounts.employee_record.is_active,
        VaulticError::EmployeeInactive
    );

    // Req 9.5 — vesting cliff gate. The cliff anchor is
    // `vesting_start + vesting_cliff`; before that moment no claim may
    // be submitted, even if `total_allocation == 0`.
    let now = Clock::get()?.unix_timestamp;
    let employee = &ctx.accounts.employee_record;
    let cliff_end = employee
        .vesting_start
        .saturating_add(employee.vesting_cliff);
    require!(now >= cliff_end, VaulticError::VestingCliffNotReached);

    // Req 9.4 — plaintext vested-amount bound. Mirrors the formula in
    // `tests-proptest/src/sim.rs::compute_vested_amount_sim`. We reproduce
    // it inline here rather than importing the sim crate (which is a
    // separate Cargo member) so the on-chain behaviour matches the
    // simulator byte-for-byte.
    //
    // The formula:
    //   if elapsed < cliff:          0
    //   else:                        min(total, total * elapsed / duration)
    // Uses `saturating_mul` to mirror FHE overflow semantics and guards
    // against `duration == 0` to avoid division-by-zero panics.
    let elapsed_i64 = now.saturating_sub(employee.vesting_start);
    let elapsed: u64 = elapsed_i64.max(0) as u64;
    let cliff: u64 = employee.vesting_cliff.max(0) as u64;
    let duration: u64 = employee.vesting_duration.max(1) as u64;
    let total_allocation = employee.total_allocation;

    let vested = if elapsed < cliff {
        0u64
    } else {
        let linear = total_allocation.saturating_mul(elapsed) / duration;
        linear.min(total_allocation)
    };

    let available = vested.saturating_sub(employee.total_claimed);
    require!(amount <= available, VaulticError::ClaimExceedsVested);

    // Req 8.9 — plaintext spending-policy gate. Runs AFTER the vesting
    // bound so that callers see the most specific error first
    // (`ClaimExceedsVested` is more informative than `SpendingLimitExceeded`
    // when both would fire).
    enforce_spending_policy(
        amount,
        ctx.accounts.policy.spending_limit,
        ctx.accounts.treasury.spending_limit_per_tx,
    )?;

    // Req 9.2 — snapshot `chain_preference` and `target_address` at submit
    // time. Mutating `EmployeeRecord` later (via `update_employee`) must
    // not retroactively change a pending claim's target.
    let treasury_key = ctx.accounts.treasury.key();
    let claim = &mut ctx.accounts.claim_record;
    claim.employee = ctx.accounts.employee_wallet.key();
    claim.treasury = treasury_key;
    claim.claim_timestamp = claim_timestamp;
    claim.amount_claimed = amount;
    claim.target_chain = employee.chain_preference;
    claim.target_address = employee.target_address;
    claim.status = ClaimStatus::Pending;
    claim.ika_message_hash = [0u8; 32];
    claim.ika_signature = [0u8; 96];
    claim.bump = ctx.bumps.claim_record;

    emit!(ClaimSubmitted {
        employee: claim.employee,
        amount,
        target_chain: claim.target_chain,
    });

    Ok(())
}

// --------------------------------------------------------------------------
// process_claim — Req 9.7–9.8  (Task 11.4)
// --------------------------------------------------------------------------

/// Accounts for `process_claim` (design §3.1.1.14).
///
/// Admin-gated via `has_one = authority` on `treasury`. Uses the corrected
/// 5-account Ika CPI layout from the upstream pre-alpha docs.
/// The `MessageApproval` PDA is derived from
/// `["message_approval", dwallet_pubkey, message_hash]` under the Ika program.
#[derive(Accounts)]
#[instruction(message_approval_bump: u8, cpi_authority_bump: u8)]
pub struct ProcessClaim<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut, has_one = authority @ VaulticError::Unauthorized)]
    pub treasury: Account<'info, TreasuryConfig>,

    #[account(mut, has_one = treasury @ VaulticError::Unauthorized)]
    pub employee_record: Account<'info, EmployeeRecord>,

    #[account(mut, has_one = treasury @ VaulticError::Unauthorized)]
    pub claim_record: Account<'info, ClaimRecord>,

    // ── Ika CPI accounts (5 — corrected from upstream docs) ──────────────
    /// CHECK: MessageApproval PDA — seeds ["message_approval", dwallet, message_hash]
    /// under the Ika program. Writable so Ika can initialise it.
    #[account(mut)]
    pub message_approval: UncheckedAccount<'info>,

    /// CHECK: dWallet account owned by the Ika program.
    pub dwallet: UncheckedAccount<'info>,

    /// CHECK: PDA `[IKA_CPI_AUTHORITY_SEED]` of THIS program — signs via invoke_signed.
    #[account(
        seeds = [ika::IKA_CPI_AUTHORITY_SEED],
        bump = cpi_authority_bump,
    )]
    pub ika_cpi_authority: UncheckedAccount<'info>,

    /// Pays rent for the MessageApproval account.
    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn process_claim(
    ctx: Context<ProcessClaim>,
    message_approval_bump: u8,
    cpi_authority_bump: u8,
    message: Vec<u8>,
) -> Result<()> {
    require!(
        ctx.accounts.treasury.is_active,
        VaulticError::TreasuryInactive
    );
    require!(
        ctx.accounts.claim_record.status == ClaimStatus::Pending,
        VaulticError::Unauthorized
    );
    require!(
        ctx.accounts.claim_record.ika_message_hash == [0u8; 32],
        VaulticError::Unauthorized
    );

    // Derive the message hash for storage — approve_message_cpi returns it.
    let message_hash = ika::approve_message_cpi(
        ctx.accounts.message_approval.to_account_info(),
        ctx.accounts.dwallet.to_account_info(),
        ctx.accounts.ika_cpi_authority.to_account_info(),
        ctx.accounts.payer.to_account_info(),
        ctx.accounts.system_program.to_account_info(),
        message_approval_bump,
        cpi_authority_bump,
        &message,
        ctx.accounts.claim_record.employee,
        // signature_scheme: 0 = Ed25519 (default for Solana wallets)
        u16::from(ctx.accounts.treasury.dwallet_curve_type) as u8,
    )?;

    let claim = &mut ctx.accounts.claim_record;
    claim.ika_message_hash = message_hash;
    claim.status = ClaimStatus::IkaApproved;

    emit!(IkaSigningRequested {
        treasury: claim.treasury,
        message_hash,
        target_chain: claim.target_chain,
    });

    Ok(())
}

// --------------------------------------------------------------------------
// finalize_claim — Phase 2 completion (Req 9.8)
//
// Reads the MessageApproval account after the Ika MPC network has produced
// a signature. Copies the signature bytes into ClaimRecord.ika_signature,
// increments employee_record.total_claimed, and transitions the claim to
// Executed.
//
// The MessageApproval account layout (from upstream docs):
//   offset 139: status u8 (0=Pending, 1=Signed)
//   offset 140: signature_len u16 LE
//   offset 142: signature bytes
// --------------------------------------------------------------------------

/// Accounts for `finalize_claim`.
///
/// Admin-gated. The `message_approval` account is the same PDA that was
/// initialised by `process_claim`; we read its raw bytes to extract the
/// Ika-produced signature.
#[derive(Accounts)]
pub struct FinalizeClaim<'info> {
    pub authority: Signer<'info>,

    #[account(has_one = authority @ VaulticError::Unauthorized)]
    pub treasury: Account<'info, TreasuryConfig>,

    #[account(mut, has_one = treasury @ VaulticError::Unauthorized)]
    pub employee_record: Account<'info, EmployeeRecord>,

    #[account(mut, has_one = treasury @ VaulticError::Unauthorized)]
    pub claim_record: Account<'info, ClaimRecord>,

    /// CHECK: MessageApproval PDA — same account initialised by process_claim.
    /// We read its raw bytes to check status and extract the signature.
    pub message_approval: UncheckedAccount<'info>,
}

pub fn finalize_claim(ctx: Context<FinalizeClaim>) -> Result<()> {
    require!(
        ctx.accounts.treasury.is_active,
        VaulticError::TreasuryInactive
    );
    // Only IkaApproved claims can be finalized.
    require!(
        ctx.accounts.claim_record.status == ClaimStatus::IkaApproved,
        VaulticError::Unauthorized
    );

    // Read the MessageApproval account raw bytes and extract the signature.
    let approval_info = ctx.accounts.message_approval.to_account_info();
    let approval_data = approval_info.try_borrow_data()?;
    let sig_bytes = ika::read_message_approval_signature(&approval_data)?;
    drop(approval_data);

    // Copy up to 96 bytes of signature into the fixed ClaimRecord slot.
    let mut sig_arr = [0u8; 96];
    let copy_len = sig_bytes.len().min(96);
    sig_arr[..copy_len].copy_from_slice(&sig_bytes[..copy_len]);

    // Persist signature and transition state.
    let claim = &mut ctx.accounts.claim_record;
    claim.ika_signature = sig_arr;
    claim.status = ClaimStatus::Executed;

    // Increment total_claimed — this is the Phase 2 completion step that
    // was deferred in the original process_claim implementation.
    let employee = &mut ctx.accounts.employee_record;
    employee.total_claimed = employee
        .total_claimed
        .saturating_add(claim.amount_claimed);

    Ok(())
}
