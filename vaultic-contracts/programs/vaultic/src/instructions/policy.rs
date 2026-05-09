//! Spending policy + multi-sig approval instructions — Req 8.
//!
//! - `create_policy` (Req 8.1): creates a `PolicyAccount` PDA with a
//!   spending limit, time lock, and an approver allowlist (up to 5).
//! - `propose_transaction` (design §3.1.1.15): opens a `TransactionProposal`
//!   PDA whose `proposed_at` anchor enables the time-lock gate of Req 8.6.
//! - `approve_transaction` (Req 8.4–8.8): multi-sig approval flow with
//!   single-shot execution on threshold, enforced in the evaluation order
//!   documented in design §3.1.1.15 (P11 property test).

use anchor_lang::prelude::*;

use crate::errors::VaulticError;
use crate::state::{PolicyAccount, TransactionProposal, TreasuryConfig};

// --------------------------------------------------------------------------
// Internal helpers
// --------------------------------------------------------------------------

/// Count of non-default (non-zero) approvers in a 5-slot allowlist.
///
/// Used by `create_policy` to enforce Req 8.1's second guard:
/// `required_approvers <= non_zero_approver_count`. Returning `u8` is safe
/// because the input length is fixed at 5.
fn non_zero_approver_count(approvers: &[Pubkey; 5]) -> u8 {
    approvers
        .iter()
        .filter(|k| **k != Pubkey::default())
        .count() as u8
}

// --------------------------------------------------------------------------
// create_policy — Req 8.1  (Task 12.1)
// --------------------------------------------------------------------------

/// Accounts for `create_policy` (design §3.1.1.15).
///
/// `has_one = authority` on the treasury enforces Req 1.4; the body adds
/// the `is_active` guard (Req 1.6). The `policy` PDA uses a
/// policy-id-scoped seed so a single treasury can host multiple
/// independent policies simultaneously.
#[derive(Accounts)]
#[instruction(policy_id: u64)]
pub struct CreatePolicy<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(has_one = authority @ VaulticError::Unauthorized)]
    pub treasury: Account<'info, TreasuryConfig>,

    #[account(
        init,
        payer = authority,
        space = 8 + PolicyAccount::INIT_SPACE,
        seeds = [b"policy", treasury.key().as_ref(), &policy_id.to_le_bytes()],
        bump,
    )]
    pub policy: Account<'info, PolicyAccount>,

    pub system_program: Program<'info, System>,
}

pub fn create_policy(
    ctx: Context<CreatePolicy>,
    policy_id: u64,
    spending_limit: u64,
    time_lock: i64,
    required_approvers: u8,
    approvers: [Pubkey; 5],
) -> Result<()> {
    // Req 1.6 — inactive treasury blocks policy creation.
    require!(
        ctx.accounts.treasury.is_active,
        VaulticError::TreasuryInactive
    );

    // Req 8.1 — `required_approvers` must fit the fixed-size allowlist
    // AND must not exceed the count of actually-populated approver slots.
    // `non_zero_approver_count` filters `Pubkey::default()` sentinels so
    // authorities can leave unused slots blank without tripping the guard.
    require!(required_approvers <= 5, VaulticError::InvalidApproverCount);
    require!(
        required_approvers <= non_zero_approver_count(&approvers),
        VaulticError::InvalidApproverCount
    );

    let policy = &mut ctx.accounts.policy;
    policy.treasury = ctx.accounts.treasury.key();
    policy.policy_id = policy_id;
    policy.spending_limit = spending_limit;
    policy.time_lock = time_lock;
    policy.required_approvers = required_approvers;
    policy.approvers = approvers;
    policy.is_active = true;
    // Anchor 0.32 does NOT auto-persist PDA bumps on `init` — see design
    // §3.1.1.1 note and state/mod.rs doc comment.
    policy.bump = ctx.bumps.policy;

    Ok(())
}

// --------------------------------------------------------------------------
// propose_transaction — design §3.1.1.15  (Task 12.2)
// --------------------------------------------------------------------------

/// Accounts for `propose_transaction` (design §3.1.1.15).
///
/// A `TransactionProposal` PDA is required (rather than passing the
/// proposal by transient args) because `approve_transaction` must compute
/// `now - proposed_at` to enforce Req 8.6's time-lock; that anchor has to
/// live somewhere persistent.
#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct ProposeTransaction<'info> {
    #[account(has_one = treasury @ VaulticError::Unauthorized)]
    pub policy: Account<'info, PolicyAccount>,

    pub treasury: Account<'info, TreasuryConfig>,

    #[account(mut)]
    pub proposer: Signer<'info>,

    #[account(
        init,
        payer = proposer,
        space = 8 + TransactionProposal::INIT_SPACE,
        seeds = [b"proposal", treasury.key().as_ref(), &nonce.to_le_bytes()],
        bump,
    )]
    pub proposal: Account<'info, TransactionProposal>,

    pub system_program: Program<'info, System>,
}

pub fn propose_transaction(
    ctx: Context<ProposeTransaction>,
    nonce: u64,
    amount: u64,
    target: Pubkey,
) -> Result<()> {
    // Req 8.8 — inactive policy blocks new proposals.
    require!(ctx.accounts.policy.is_active, VaulticError::PolicyInactive);
    // Req 8.2/8.3 — proposal amount must fit both the policy limit AND
    // the treasury per-tx cap. Mirrors the `enforce_spending_policy`
    // helper used by `submit_claim` (Req 8.9).
    require!(
        amount <= ctx.accounts.policy.spending_limit,
        VaulticError::SpendingLimitExceeded
    );
    require!(
        amount <= ctx.accounts.treasury.spending_limit_per_tx,
        VaulticError::SpendingLimitExceeded
    );

    let proposal = &mut ctx.accounts.proposal;
    proposal.treasury = ctx.accounts.treasury.key();
    proposal.policy = ctx.accounts.policy.key();
    proposal.nonce = nonce;
    proposal.proposer = ctx.accounts.proposer.key();
    proposal.amount = amount;
    proposal.target = target;
    proposal.proposed_at = Clock::get()?.unix_timestamp;
    proposal.approvers_signed = [false; 5];
    proposal.approval_count = 0;
    proposal.executed = false;
    proposal.bump = ctx.bumps.proposal;

    Ok(())
}

// --------------------------------------------------------------------------
// approve_transaction — Req 8.4–8.8  (Task 12.3)
// --------------------------------------------------------------------------

/// Accounts for `approve_transaction` (design §3.1.1.15).
///
/// `has_one = treasury` AND `has_one = policy` on the proposal tie a
/// caller to the exact policy that governed the original proposal — a
/// caller cannot smuggle in a looser unrelated policy to bypass the
/// approver allowlist.
#[derive(Accounts)]
pub struct ApproveTransaction<'info> {
    #[account(
        mut,
        has_one = treasury @ VaulticError::Unauthorized,
        has_one = policy @ VaulticError::Unauthorized,
    )]
    pub proposal: Account<'info, TransactionProposal>,

    pub treasury: Account<'info, TreasuryConfig>,

    pub policy: Account<'info, PolicyAccount>,

    #[account(mut)]
    pub approver: Signer<'info>,
}

pub fn approve_transaction(ctx: Context<ApproveTransaction>) -> Result<()> {
    let policy = &ctx.accounts.policy;
    let proposal = &mut ctx.accounts.proposal;

    // Evaluation order (asserted by P11, design §3.1.1.15):
    //   PolicyInactive
    //   → Unauthorized (proposal.executed — single-shot guard)
    //   → TimeLockNotElapsed
    //   → Unauthorized (non-approver signer)
    //   → InsufficientApprovals
    require!(policy.is_active, VaulticError::PolicyInactive);

    // Single-shot guard: once a proposal has crossed the threshold and
    // flipped `executed = true`, subsequent approvals are rejected.
    require!(!proposal.executed, VaulticError::Unauthorized);

    // Req 8.6/8.7 — time-lock gate. `proposed_at` is an i64 Unix timestamp;
    // subtraction is exact for the ranges we care about. A `time_lock` of
    // 0 means the gate accepts immediately.
    let now = Clock::get()?.unix_timestamp;
    require!(
        now - proposal.proposed_at >= policy.time_lock,
        VaulticError::TimeLockNotElapsed
    );

    // Locate the approver's position in the fixed-size allowlist.
    // `position` returns the FIRST match, so duplicate approver entries
    // (which `create_policy` does not forbid) vote as the lowest slot.
    // `Pubkey::default()` empty slots cannot match a real signer.
    let approver_key = ctx.accounts.approver.key();
    let idx = policy
        .approvers
        .iter()
        .position(|k| *k == approver_key)
        .ok_or(VaulticError::Unauthorized)?;

    // Flip the bit only once per approver to prevent double-counting a
    // repeat signer. `saturating_add` is defensive — the count cannot
    // exceed 5 given `approvers_signed.len() == 5`.
    if !proposal.approvers_signed[idx] {
        proposal.approvers_signed[idx] = true;
        proposal.approval_count = proposal.approval_count.saturating_add(1);
    }

    // Threshold check (Req 8.4–8.5). On success, we flip `executed` and
    // return Ok. Actual fund movement is the caller's responsibility —
    // the companion instruction (e.g. `approve_payroll_message`,
    // `submit_claim`) reads `proposal.executed` as a gate.
    if proposal.approval_count >= policy.required_approvers {
        proposal.executed = true;
        Ok(())
    } else {
        // A successful signature that still hasn't hit quorum IS the
        // error case: the ix returns `InsufficientApprovals` so the
        // caller can distinguish "your vote was recorded but we're
        // still waiting" from a successful execution.
        Err(error!(VaulticError::InsufficientApprovals))
    }
}
