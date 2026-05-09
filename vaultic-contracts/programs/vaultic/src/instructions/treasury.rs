//! Treasury lifecycle instructions — Reqs 1, 27.
//!
//! - `initialize_treasury` (Req 1.1–1.3): creates the TreasuryConfig PDA
//! - `update_treasury`     (Req 1.4–1.6): mutates treasury settings, allowed
//!    even when `is_active == false` (Req 1.6 exception)
//! - `fund_treasury`       (Req 27.1–27.2): deposits SOL into the treasury
//!    PDA via `system_program::transfer` CPI. Any wallet may fund (design
//!    §3.1.1.3 does not restrict the depositor); only `treasury.is_active`
//!    is required.

use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};

use crate::errors::VaulticError;
use crate::events::TreasuryInitialized;
use crate::state::TreasuryConfig;

// --------------------------------------------------------------------------
// initialize_treasury — Req 1.1–1.3
// --------------------------------------------------------------------------

#[derive(Accounts)]
#[instruction(name: String)]
pub struct InitializeTreasury<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + TreasuryConfig::INIT_SPACE,
        seeds = [b"treasury", authority.key().as_ref()],
        bump,
    )]
    pub treasury: Account<'info, TreasuryConfig>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_treasury(
    ctx: Context<InitializeTreasury>,
    name: String,
    payroll_interval: i64,
    spending_limit_per_tx: u64,
    required_approvers: u8,
    dwallet_id: Pubkey,
) -> Result<()> {
    // Req 1.1 implementation guard — `TreasuryConfig.name` is `#[max_len(64)]`.
    require!(name.len() <= 64, VaulticError::NameTooLong);
    // Req 8.1 guard reused for `initialize_treasury` (design §3.1.1.1).
    require!(required_approvers <= 5, VaulticError::InvalidApproverCount);

    let treasury = &mut ctx.accounts.treasury;
    treasury.authority = ctx.accounts.authority.key();
    treasury.dwallet_id = dwallet_id;
    treasury.dwallet_curve_type = 0;
    treasury.name = name;
    treasury.payroll_interval = payroll_interval;
    treasury.spending_limit_per_tx = spending_limit_per_tx;
    treasury.required_approvers = required_approvers;
    treasury.total_employees = 0;
    treasury.last_payroll_timestamp = 0;
    treasury.is_active = true;
    // Anchor 0.32 does NOT auto-persist PDA bumps on `init` — see design
    // §3.1.1.1 note and state/mod.rs doc comment.
    treasury.bump = ctx.bumps.treasury;

    emit!(TreasuryInitialized {
        treasury: treasury.key(),
        authority: treasury.authority,
    });

    Ok(())
}

// --------------------------------------------------------------------------
// update_treasury — Req 1.4–1.6
// --------------------------------------------------------------------------

#[derive(Accounts)]
pub struct UpdateTreasury<'info> {
    pub authority: Signer<'info>,
    // `has_one = authority` enforces Req 1.4 (Unauthorized on mismatch).
    // Intentionally NOT gated on `treasury.is_active` — Req 1.6 carves out
    // `update_treasury` so admins can re-enable a paused treasury.
    #[account(mut, has_one = authority @ VaulticError::Unauthorized)]
    pub treasury: Account<'info, TreasuryConfig>,
}

pub fn update_treasury(
    ctx: Context<UpdateTreasury>,
    name: Option<String>,
    payroll_interval: Option<i64>,
    spending_limit_per_tx: Option<u64>,
    required_approvers: Option<u8>,
    is_active: Option<bool>,
) -> Result<()> {
    let treasury = &mut ctx.accounts.treasury;

    if let Some(n) = name {
        require!(n.len() <= 64, VaulticError::NameTooLong);
        treasury.name = n;
    }
    if let Some(interval) = payroll_interval {
        treasury.payroll_interval = interval;
    }
    if let Some(limit) = spending_limit_per_tx {
        treasury.spending_limit_per_tx = limit;
    }
    if let Some(req) = required_approvers {
        require!(req <= 5, VaulticError::InvalidApproverCount);
        treasury.required_approvers = req;
    }
    if let Some(active) = is_active {
        treasury.is_active = active;
    }

    Ok(())
}

// --------------------------------------------------------------------------
// fund_treasury — Req 27.1–27.2
// --------------------------------------------------------------------------

#[derive(Accounts)]
pub struct FundTreasury<'info> {
    /// Depositor — any wallet may fund a DAO treasury (design §3.1.1.3).
    #[account(mut)]
    pub funder: Signer<'info>,
    #[account(mut)]
    pub treasury: Account<'info, TreasuryConfig>,
    pub system_program: Program<'info, System>,
}

pub fn fund_treasury(ctx: Context<FundTreasury>, amount: u64) -> Result<()> {
    // Req 27: only active treasuries may accept deposits.
    require!(
        ctx.accounts.treasury.is_active,
        VaulticError::TreasuryInactive
    );

    let cpi_accounts = Transfer {
        from: ctx.accounts.funder.to_account_info(),
        to: ctx.accounts.treasury.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.system_program.to_account_info(), cpi_accounts);
    system_program::transfer(cpi_ctx, amount)?;

    Ok(())
}
