//! Vaultic Treasury OS — Solana program entrypoint.
//!
//! This program coordinates:
//! - Treasury and employee lifecycle state
//! - FHE payroll computation via CPI to the Encrypt program
//! - Cross-chain signature approval via raw CPI to the Ika dWallet program
//! - Policy-based multi-signature approvals
//!
//! The instruction surface is defined in `instructions/` and dispatched from
//! the `#[program]` module below.

// Clippy allow-list for patterns that arise from Anchor / doc conventions:
// - `too_many_arguments` fires on flat Anchor instruction signatures
//   (`register_employee` and the Ika CPI helper). Collapsing into a struct
//   hurts IDL / client ergonomics more than it helps readability on-chain.
// - `doc_overindented_list_items` fires on 3-space-indented markdown
//   bullets inside our doc comments, which render correctly in `cargo doc`
//   and match the project's prevailing rustdoc style.
#![allow(clippy::too_many_arguments, clippy::doc_overindented_list_items)]

use anchor_lang::prelude::*;

pub mod encrypt;
pub mod errors;
pub mod events;
pub mod fhe;
pub mod ika;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("5igWLTbdAjGfAZKsK9G3Buhe7mkrgC3GEYkQaD4PrTnZ");

#[program]
pub mod vaultic {
    use super::*;

    // -------------------------------------------------------------------
    // Treasury lifecycle (Reqs 1, 27)
    // -------------------------------------------------------------------

    pub fn initialize_treasury(
        ctx: Context<InitializeTreasury>,
        name: String,
        payroll_interval: i64,
        spending_limit_per_tx: u64,
        required_approvers: u8,
        dwallet_id: Pubkey,
    ) -> Result<()> {
        instructions::treasury::initialize_treasury(
            ctx,
            name,
            payroll_interval,
            spending_limit_per_tx,
            required_approvers,
            dwallet_id,
        )
    }

    pub fn update_treasury(
        ctx: Context<UpdateTreasury>,
        name: Option<String>,
        payroll_interval: Option<i64>,
        spending_limit_per_tx: Option<u64>,
        required_approvers: Option<u8>,
        is_active: Option<bool>,
    ) -> Result<()> {
        instructions::treasury::update_treasury(
            ctx,
            name,
            payroll_interval,
            spending_limit_per_tx,
            required_approvers,
            is_active,
        )
    }

    pub fn fund_treasury(ctx: Context<FundTreasury>, amount: u64) -> Result<()> {
        instructions::treasury::fund_treasury(ctx, amount)
    }

    // -------------------------------------------------------------------
    // Employee lifecycle (Req 2, encrypt-integration Req 4.1–4.3)
    // -------------------------------------------------------------------

    pub fn register_employee(
        ctx: Context<RegisterEmployee>,
        employee_wallet: Pubkey,
        role_id: u8,
        salary_plaintext: u64,
        bonus_plaintext: u64,
        performance_plaintext: u64,
        vesting_start: i64,
        vesting_cliff: i64,
        vesting_duration: i64,
        total_allocation: u64,
        chain_preference: u8,
        target_address: [u8; 64],
        cpi_authority_bump: u8,
    ) -> Result<()> {
        instructions::employee::register_employee(
            ctx,
            employee_wallet,
            role_id,
            salary_plaintext,
            bonus_plaintext,
            performance_plaintext,
            vesting_start,
            vesting_cliff,
            vesting_duration,
            total_allocation,
            chain_preference,
            target_address,
            cpi_authority_bump,
        )
    }

    pub fn update_employee(
        ctx: Context<UpdateEmployee>,
        encrypted_salary: Option<Pubkey>,
        encrypted_performance: Option<Pubkey>,
        chain_preference: Option<u8>,
        is_active: Option<bool>,
    ) -> Result<()> {
        instructions::employee::update_employee(
            ctx,
            encrypted_salary,
            encrypted_performance,
            chain_preference,
            is_active,
        )
    }

    pub fn terminate_employee(ctx: Context<TerminateEmployee>) -> Result<()> {
        instructions::employee::terminate_employee(ctx)
    }

    // -------------------------------------------------------------------
    // Payroll + FHE (Reqs 3, 4, 27, encrypt-integration Req 4.4)
    //
    // `set_payroll_config` is split into three instructions due to
    // Solana's 1232-byte transaction limit (design §3.1.2, Task 8.5).
    // The frontend submits all three in sequence.
    // -------------------------------------------------------------------

    pub fn set_payroll_band_mins(
        ctx: Context<SetPayrollBandMins>,
        band_min_plaintexts: [u64; 5],
        cpi_authority_bump: u8,
    ) -> Result<()> {
        instructions::payroll::set_payroll_band_mins(ctx, band_min_plaintexts, cpi_authority_bump)
    }

    pub fn set_payroll_band_maxs(
        ctx: Context<SetPayrollBandMaxs>,
        band_max_plaintexts: [u64; 5],
        cpi_authority_bump: u8,
    ) -> Result<()> {
        instructions::payroll::set_payroll_band_maxs(ctx, band_max_plaintexts, cpi_authority_bump)
    }

    pub fn set_payroll_threshold(
        ctx: Context<SetPayrollThreshold>,
        performance_threshold_plaintext: u64,
        bonus_multiplier_bps: u16,
        cpi_authority_bump: u8,
    ) -> Result<()> {
        instructions::payroll::set_payroll_threshold(
            ctx,
            performance_threshold_plaintext,
            bonus_multiplier_bps,
            cpi_authority_bump,
        )
    }

    pub fn execute_payroll_computation(
        ctx: Context<ExecutePayroll>,
        execution_id: u64,
        cpi_authority_bump: u8,
    ) -> Result<()> {
        instructions::payroll::execute_payroll_computation(ctx, execution_id, cpi_authority_bump)
    }

    pub fn finalize_payroll(ctx: Context<FinalizePayroll>, execution_id: u64) -> Result<()> {
        instructions::payroll::finalize_payroll(ctx, execution_id)
    }

    pub fn compute_bonus(
        ctx: Context<ComputeBonus>,
        cpi_authority_bump: u8,
        bonus_multiplier_bps: u64,
    ) -> Result<()> {
        instructions::payroll::compute_bonus(ctx, cpi_authority_bump, bonus_multiplier_bps)
    }

    // -------------------------------------------------------------------
    // Salary decryption (Req 5) — privacy-critical
    // -------------------------------------------------------------------

    pub fn request_salary_decryption(
        ctx: Context<RequestSalaryDecryption>,
        cpi_authority_bump: u8,
    ) -> Result<()> {
        instructions::decryption::request_salary_decryption(ctx, cpi_authority_bump)
    }

    pub fn reveal_salary(ctx: Context<RevealSalary>) -> Result<()> {
        // PRIVACY-CRITICAL (Req 5.4): plaintext leaves the chain exclusively
        // via `set_return_data`, and is NEVER persisted to any on-chain
        // account, log, or event. See `instructions::decryption::reveal_salary`
        // for the full invariant commentary.
        instructions::decryption::reveal_salary(ctx)
    }

    // -------------------------------------------------------------------
    // Ika dWallet + cross-chain (Reqs 6, 7)
    // -------------------------------------------------------------------

    pub fn create_dwallet(
        ctx: Context<CreateDWallet>,
        dwallet_id: Pubkey,
        curve_type: u8,
    ) -> Result<()> {
        instructions::dwallet::create_dwallet(ctx, dwallet_id, curve_type)
    }

    pub fn approve_payroll_message(
        ctx: Context<ApprovePayrollMessage>,
        execution_id: u64,
        cpi_authority_bump: u8,
        ika_cpi_bump: u8,
        message: Vec<u8>,
        target_chain: u8,
    ) -> Result<()> {
        instructions::dwallet::approve_payroll_message(
            ctx,
            execution_id,
            cpi_authority_bump,
            ika_cpi_bump,
            message,
            target_chain,
        )
    }

    // -------------------------------------------------------------------
    // Claims (Req 9)
    // -------------------------------------------------------------------

    pub fn submit_claim(
        ctx: Context<SubmitClaim>,
        amount: u64,
        claim_timestamp: i64,
    ) -> Result<()> {
        instructions::claim::submit_claim(ctx, amount, claim_timestamp)
    }

    pub fn process_claim(
        ctx: Context<ProcessClaim>,
        message_approval_bump: u8,
        cpi_authority_bump: u8,
        message: Vec<u8>,
    ) -> Result<()> {
        instructions::claim::process_claim(ctx, message_approval_bump, cpi_authority_bump, message)
    }

    pub fn finalize_claim(ctx: Context<FinalizeClaim>) -> Result<()> {
        instructions::claim::finalize_claim(ctx)
    }

    // -------------------------------------------------------------------
    // Policy + multi-sig approvals (Req 8)
    // -------------------------------------------------------------------

    pub fn create_policy(
        ctx: Context<CreatePolicy>,
        policy_id: u64,
        spending_limit: u64,
        time_lock: i64,
        required_approvers: u8,
        approvers: [Pubkey; 5],
    ) -> Result<()> {
        instructions::policy::create_policy(
            ctx,
            policy_id,
            spending_limit,
            time_lock,
            required_approvers,
            approvers,
        )
    }

    pub fn propose_transaction(
        ctx: Context<ProposeTransaction>,
        nonce: u64,
        amount: u64,
        target: Pubkey,
    ) -> Result<()> {
        instructions::policy::propose_transaction(ctx, nonce, amount, target)
    }

    pub fn approve_transaction(ctx: Context<ApproveTransaction>) -> Result<()> {
        instructions::policy::approve_transaction(ctx)
    }
}
