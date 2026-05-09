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
use solana_keccak_hasher::hashv;

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
/// Admin-gated via `has_one = authority` on `treasury`. Mirrors the Ika
/// CPI account set used by `approve_payroll_message`; `employee_record`
/// is carried so the Phase 2 `total_claimed` bump (deferred to a Phase
/// 1.5 follow-up) can execute in the same instruction once the
/// MessageApproval layout is pinned.
#[derive(Accounts)]
#[instruction(cpi_authority_bump: u8)]
pub struct ProcessClaim<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut, has_one = authority @ VaulticError::Unauthorized)]
    pub treasury: Account<'info, TreasuryConfig>,

    #[account(mut, has_one = treasury @ VaulticError::Unauthorized)]
    pub employee_record: Account<'info, EmployeeRecord>,

    #[account(mut, has_one = treasury @ VaulticError::Unauthorized)]
    pub claim_record: Account<'info, ClaimRecord>,

    // ── Ika CPI accounts (7) ──────────────────────────────────────────────
    /// CHECK: Ika program id; validated by the Ika runtime.
    pub ika_program: UncheckedAccount<'info>,
    /// CHECK: Ika DWalletCoordinator PDA (writable).
    #[account(mut)]
    pub coordinator: UncheckedAccount<'info>,
    /// CHECK: MessageApproval account the Ika CPI initialises (writable).
    #[account(mut)]
    pub message_approval: UncheckedAccount<'info>,
    /// CHECK: dwallet account owned by the Ika program.
    pub dwallet: UncheckedAccount<'info>,
    /// CHECK: this program's executable account.
    pub caller_program: UncheckedAccount<'info>,
    /// CHECK: PDA `[IKA_CPI_AUTHORITY_SEED]` of THIS program.
    #[account(
        seeds = [ika::IKA_CPI_AUTHORITY_SEED],
        bump = cpi_authority_bump,
    )]
    pub ika_cpi_authority: UncheckedAccount<'info>,
    /// CHECK: signer that pays rent for the MessageApproval account.
    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn process_claim(
    ctx: Context<ProcessClaim>,
    cpi_authority_bump: u8,
    message: Vec<u8>,
) -> Result<()> {
    // Req 1.6 — inactive treasury blocks everything except `update_treasury`.
    require!(
        ctx.accounts.treasury.is_active,
        VaulticError::TreasuryInactive
    );

    // ────────────────────────────────────────────────────────────────────
    // FOLLOW-UP — Phase 2 finalization (design §3.1.1.14).
    //
    // The second half of the design (reading the Ika MessageApproval's
    // `Signed` status, copying the signature bytes into
    // `claim_record.ika_signature`, incrementing
    // `employee_record.total_claimed`, and transitioning
    // `status = Executed`) requires knowing the byte offsets of the
    // MessageApproval account layout, which lives in the
    // `ika-dwallet-anchor` crate. That crate targets anchor-lang 1.0 and
    // cannot be imported today without forking the Encrypt pin (see the
    // crate-root FOLLOW-UP in `crate::fhe`).
    //
    // Phase 1 MVP (this code path) therefore only implements the forward
    // approval: we request Ika signing, stamp
    // `claim_record.ika_message_hash`, and transition to `IkaApproved`.
    // A `finalize_claim` admin instruction will be added in Phase 1.5 to
    // read the signed status and complete the state machine.
    // ────────────────────────────────────────────────────────────────────
    require!(
        ctx.accounts.claim_record.status == ClaimStatus::Pending,
        VaulticError::Unauthorized
    );
    require!(
        ctx.accounts.claim_record.ika_message_hash == [0u8; 32],
        VaulticError::Unauthorized
    );

    let message_hash = hashv(&[message.as_slice()]).to_bytes();

    // Req 7.2 / 9.7 — raw CPI to Ika `approve_message`.
    let stored_digest = ika::approve_message_cpi(
        ctx.accounts.coordinator.to_account_info(),
        ctx.accounts.message_approval.to_account_info(),
        ctx.accounts.dwallet.to_account_info(),
        ctx.accounts.caller_program.to_account_info(),
        ctx.accounts.ika_cpi_authority.to_account_info(),
        ctx.accounts.payer.to_account_info(),
        ctx.accounts.system_program.to_account_info(),
        cpi_authority_bump,
        &message,
        [0u8; 32], // no metadata digest for claim messages
        ctx.accounts.claim_record.employee,
        u16::from(ctx.accounts.treasury.dwallet_curve_type),
    )?;
    debug_assert_eq!(stored_digest, message_hash);

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
