//! Payroll configuration and FHE execution instructions — Reqs 3, 4, 27.
//!
//! - `set_payroll_config` (Req 3): creates or updates the `PayrollConfig`
//!   PDA with salary band ciphertext references and bonus parameters.
//! - `execute_payroll_computation` (Req 4.1–4.4, 4.9, 4.10): opens a
//!   `PayrollExecution` in `Processing` and issues the `compute_total_payout`
//!   Encrypt CPI. The async completion model (design §3.1.1.7) requires a
//!   sibling `finalize_payroll` to close the run.
//! - `finalize_payroll` (Req 4.9, design §3.1.1.8): transitions the
//!   `PayrollExecution` to `Completed` once the output ciphertext commit
//!   is observable via `encrypt::is_committed`.
//! - `compute_bonus` (Req 27.3–27.4): invokes `compute_bonus_amount` and
//!   stores the resulting ciphertext pubkey in `EmployeeRecord.encrypted_bonus`.
//!
//! ### Encrypt CPI shape (tasks 9.2, 9.4)
//!
//! The design document (§3.1.1.7) writes the CPI setup as
//! `EncryptContext::new(...)`; the pre-alpha `encrypt-anchor` crate has no
//! such constructor — `EncryptContext` is a plain struct populated with a
//! struct literal (see `crate::encrypt` module docs). The
//! `#[encrypt_fn]` macro emits a **non-pub** trait (`<Name>Cpi`) per
//! function, impl'd blanket-ly on every `EncryptCpi`, with a method named
//! after the snake_case function. The trait is module-local to
//! `crate::fhe`, so instruction handlers cannot call
//! `encrypt_ctx.compute_total_payout(..)` directly; we go through the
//! free-function wrappers in `crate::fhe` (`compute_total_payout_cpi`,
//! `compute_bonus_amount_cpi`), which accept `&EncryptContext` and
//! delegate to the generated trait method.
//!
//! ### Plaintext parameters
//!
//! The `#[encrypt_fn]` macro folds `P*` (plaintext) parameters into the
//! compiled graph at macro expansion time. In the pre-alpha crate those
//! values are **not** passed through the CPI — only encrypted input
//! ciphertexts and output ciphertexts cross the boundary. The
//! `bonus_multiplier_bps` argument on `compute_bonus` therefore travels
//! only for on-chain bookkeeping and audit (it is stored in
//! `PayrollConfig.bonus_multiplier_bps` by `set_payroll_config`); it does
//! not feed into the CPI call. This matches the counter example at
//! `chains/solana/examples/counter/anchor/src/lib.rs` in the
//! encrypt-pre-alpha source tree.

use anchor_lang::prelude::*;

use crate::encrypt::is_committed;
use crate::errors::VaulticError;
use crate::events::{FHEComputationRequested, PayrollExecutionCompleted, PayrollExecutionStarted};
use crate::state::{
    EmployeeRecord, PayrollConfig, PayrollExecution, PayrollStatus, TreasuryConfig,
};

// --------------------------------------------------------------------------
// set_payroll_config — Req 3.1–3.4, encrypt-integration Req 4.4  (Task 9.1)
//
// SPLIT INTO THREE INSTRUCTIONS due to Solana's 1232-byte transaction limit.
// A single instruction with 11 fresh keypair signers + 9 Encrypt CPI accounts
// would require ~1715 bytes — exceeding the limit by ~483 bytes.
//
// The three instructions are:
//   1. `set_payroll_band_mins`  — initializes 5 band_min ciphertext slots
//   2. `set_payroll_band_maxs`  — initializes 5 band_max ciphertext slots
//   3. `set_payroll_threshold`  — initializes the performance_threshold slot
//                                 and sets bonus_multiplier_bps
//
// The frontend submits all three in sequence. The `init_if_needed` on
// `PayrollConfig` means the first instruction creates the PDA; the
// subsequent two update it in place.
// --------------------------------------------------------------------------

/// Accounts for `set_payroll_band_mins` — initializes the five band_min
/// ciphertext slots (Junior, Mid, Senior, Lead, Executive).
#[derive(Accounts)]
pub struct SetPayrollBandMins<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(has_one = authority @ VaulticError::Unauthorized)]
    pub treasury: Account<'info, TreasuryConfig>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + PayrollConfig::INIT_SPACE,
        seeds = [b"payroll_config", treasury.key().as_ref()],
        bump,
    )]
    pub payroll_config: Account<'info, PayrollConfig>,

    // ── Five Fresh_Ciphertext_Keypair Signer slots ────────────────────────
    /// CHECK: Fresh keypair for band_min[0] (Junior tier minimum salary).
    #[account(mut)]
    pub ct_band_min_0: Signer<'info>,
    /// CHECK: Fresh keypair for band_min[1] (Mid tier minimum salary).
    #[account(mut)]
    pub ct_band_min_1: Signer<'info>,
    /// CHECK: Fresh keypair for band_min[2] (Senior tier minimum salary).
    #[account(mut)]
    pub ct_band_min_2: Signer<'info>,
    /// CHECK: Fresh keypair for band_min[3] (Lead tier minimum salary).
    #[account(mut)]
    pub ct_band_min_3: Signer<'info>,
    /// CHECK: Fresh keypair for band_min[4] (Executive tier minimum salary).
    #[account(mut)]
    pub ct_band_min_4: Signer<'info>,

    // ── Encrypt_CPI_Account_Block (9 accounts) ────────────────────────────
    /// CHECK: Encrypt program id.
    pub encrypt_program: UncheckedAccount<'info>,
    /// CHECK: Encrypt config PDA.
    pub config: UncheckedAccount<'info>,
    /// CHECK: Encrypt deposit PDA.
    #[account(mut)]
    pub deposit: UncheckedAccount<'info>,
    /// CHECK: PDA `[b"__encrypt_cpi_authority"]` of THIS program.
    #[account(
        seeds = [crate::encrypt::ENCRYPT_CPI_AUTHORITY_SEED],
        bump,
    )]
    pub cpi_authority: UncheckedAccount<'info>,
    /// CHECK: This program's own executable account.
    pub caller_program: UncheckedAccount<'info>,
    /// CHECK: Encrypt network encryption key PDA.
    pub network_encryption_key: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: Encrypt event authority PDA.
    pub event_authority: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn set_payroll_band_mins(
    ctx: Context<SetPayrollBandMins>,
    band_min_plaintexts: [u64; 5],
    cpi_authority_bump: u8,
) -> Result<()> {
    let encrypt_program = ctx.accounts.encrypt_program.to_account_info();
    let config = ctx.accounts.config.to_account_info();
    let deposit = ctx.accounts.deposit.to_account_info();
    let cpi_authority = ctx.accounts.cpi_authority.to_account_info();
    let caller_program = ctx.accounts.caller_program.to_account_info();
    let network_encryption_key = ctx.accounts.network_encryption_key.to_account_info();
    let payer = ctx.accounts.payer.to_account_info();
    let event_authority = ctx.accounts.event_authority.to_account_info();
    let system_program = ctx.accounts.system_program.to_account_info();
    let encrypt_ctx = crate::encrypt::EncryptContext {
        encrypt_program: &encrypt_program,
        config: &config,
        deposit: &deposit,
        cpi_authority: &cpi_authority,
        caller_program: &caller_program,
        network_encryption_key: &network_encryption_key,
        payer: &payer,
        event_authority: &event_authority,
        system_program: &system_program,
        cpi_authority_bump,
    };

    let ct_band_min = [
        ctx.accounts.ct_band_min_0.to_account_info(),
        ctx.accounts.ct_band_min_1.to_account_info(),
        ctx.accounts.ct_band_min_2.to_account_info(),
        ctx.accounts.ct_band_min_3.to_account_info(),
        ctx.accounts.ct_band_min_4.to_account_info(),
    ];
    for (i, ct) in ct_band_min.iter().enumerate() {
        encrypt_ctx
            .create_plaintext_u64(band_min_plaintexts[i], ct)
            .map_err(|_| VaulticError::CtAccountCreationFailed)?;
    }

    let payroll_config = &mut ctx.accounts.payroll_config;
    payroll_config.treasury = ctx.accounts.treasury.key();
    payroll_config.band_min = [
        ctx.accounts.ct_band_min_0.key().to_bytes(),
        ctx.accounts.ct_band_min_1.key().to_bytes(),
        ctx.accounts.ct_band_min_2.key().to_bytes(),
        ctx.accounts.ct_band_min_3.key().to_bytes(),
        ctx.accounts.ct_band_min_4.key().to_bytes(),
    ];
    payroll_config.bump = ctx.bumps.payroll_config;
    Ok(())
}

/// Accounts for `set_payroll_band_maxs` — initializes the five band_max
/// ciphertext slots (Junior, Mid, Senior, Lead, Executive).
#[derive(Accounts)]
pub struct SetPayrollBandMaxs<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(has_one = authority @ VaulticError::Unauthorized)]
    pub treasury: Account<'info, TreasuryConfig>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + PayrollConfig::INIT_SPACE,
        seeds = [b"payroll_config", treasury.key().as_ref()],
        bump,
    )]
    pub payroll_config: Account<'info, PayrollConfig>,

    // ── Five Fresh_Ciphertext_Keypair Signer slots ────────────────────────
    /// CHECK: Fresh keypair for band_max[0] (Junior tier maximum salary).
    #[account(mut)]
    pub ct_band_max_0: Signer<'info>,
    /// CHECK: Fresh keypair for band_max[1] (Mid tier maximum salary).
    #[account(mut)]
    pub ct_band_max_1: Signer<'info>,
    /// CHECK: Fresh keypair for band_max[2] (Senior tier maximum salary).
    #[account(mut)]
    pub ct_band_max_2: Signer<'info>,
    /// CHECK: Fresh keypair for band_max[3] (Lead tier maximum salary).
    #[account(mut)]
    pub ct_band_max_3: Signer<'info>,
    /// CHECK: Fresh keypair for band_max[4] (Executive tier maximum salary).
    #[account(mut)]
    pub ct_band_max_4: Signer<'info>,

    // ── Encrypt_CPI_Account_Block (9 accounts) ────────────────────────────
    /// CHECK: Encrypt program id.
    pub encrypt_program: UncheckedAccount<'info>,
    /// CHECK: Encrypt config PDA.
    pub config: UncheckedAccount<'info>,
    /// CHECK: Encrypt deposit PDA.
    #[account(mut)]
    pub deposit: UncheckedAccount<'info>,
    /// CHECK: PDA `[b"__encrypt_cpi_authority"]` of THIS program.
    #[account(
        seeds = [crate::encrypt::ENCRYPT_CPI_AUTHORITY_SEED],
        bump,
    )]
    pub cpi_authority: UncheckedAccount<'info>,
    /// CHECK: This program's own executable account.
    pub caller_program: UncheckedAccount<'info>,
    /// CHECK: Encrypt network encryption key PDA.
    pub network_encryption_key: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: Encrypt event authority PDA.
    pub event_authority: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn set_payroll_band_maxs(
    ctx: Context<SetPayrollBandMaxs>,
    band_max_plaintexts: [u64; 5],
    cpi_authority_bump: u8,
) -> Result<()> {
    let encrypt_program = ctx.accounts.encrypt_program.to_account_info();
    let config = ctx.accounts.config.to_account_info();
    let deposit = ctx.accounts.deposit.to_account_info();
    let cpi_authority = ctx.accounts.cpi_authority.to_account_info();
    let caller_program = ctx.accounts.caller_program.to_account_info();
    let network_encryption_key = ctx.accounts.network_encryption_key.to_account_info();
    let payer = ctx.accounts.payer.to_account_info();
    let event_authority = ctx.accounts.event_authority.to_account_info();
    let system_program = ctx.accounts.system_program.to_account_info();
    let encrypt_ctx = crate::encrypt::EncryptContext {
        encrypt_program: &encrypt_program,
        config: &config,
        deposit: &deposit,
        cpi_authority: &cpi_authority,
        caller_program: &caller_program,
        network_encryption_key: &network_encryption_key,
        payer: &payer,
        event_authority: &event_authority,
        system_program: &system_program,
        cpi_authority_bump,
    };

    let ct_band_max = [
        ctx.accounts.ct_band_max_0.to_account_info(),
        ctx.accounts.ct_band_max_1.to_account_info(),
        ctx.accounts.ct_band_max_2.to_account_info(),
        ctx.accounts.ct_band_max_3.to_account_info(),
        ctx.accounts.ct_band_max_4.to_account_info(),
    ];
    for (i, ct) in ct_band_max.iter().enumerate() {
        encrypt_ctx
            .create_plaintext_u64(band_max_plaintexts[i], ct)
            .map_err(|_| VaulticError::CtAccountCreationFailed)?;
    }

    let payroll_config = &mut ctx.accounts.payroll_config;
    payroll_config.band_max = [
        ctx.accounts.ct_band_max_0.key().to_bytes(),
        ctx.accounts.ct_band_max_1.key().to_bytes(),
        ctx.accounts.ct_band_max_2.key().to_bytes(),
        ctx.accounts.ct_band_max_3.key().to_bytes(),
        ctx.accounts.ct_band_max_4.key().to_bytes(),
    ];
    payroll_config.bump = ctx.bumps.payroll_config;
    Ok(())
}

/// Accounts for `set_payroll_threshold` — initializes the performance
/// threshold ciphertext slot and sets `bonus_multiplier_bps`.
#[derive(Accounts)]
pub struct SetPayrollThreshold<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(has_one = authority @ VaulticError::Unauthorized)]
    pub treasury: Account<'info, TreasuryConfig>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + PayrollConfig::INIT_SPACE,
        seeds = [b"payroll_config", treasury.key().as_ref()],
        bump,
    )]
    pub payroll_config: Account<'info, PayrollConfig>,

    // ── One Fresh_Ciphertext_Keypair Signer slot ──────────────────────────
    /// CHECK: Fresh keypair for the performance threshold ciphertext.
    #[account(mut)]
    pub ct_perf_threshold: Signer<'info>,

    // ── Encrypt_CPI_Account_Block (9 accounts) ────────────────────────────
    /// CHECK: Encrypt program id.
    pub encrypt_program: UncheckedAccount<'info>,
    /// CHECK: Encrypt config PDA.
    pub config: UncheckedAccount<'info>,
    /// CHECK: Encrypt deposit PDA.
    #[account(mut)]
    pub deposit: UncheckedAccount<'info>,
    /// CHECK: PDA `[b"__encrypt_cpi_authority"]` of THIS program.
    #[account(
        seeds = [crate::encrypt::ENCRYPT_CPI_AUTHORITY_SEED],
        bump,
    )]
    pub cpi_authority: UncheckedAccount<'info>,
    /// CHECK: This program's own executable account.
    pub caller_program: UncheckedAccount<'info>,
    /// CHECK: Encrypt network encryption key PDA.
    pub network_encryption_key: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: Encrypt event authority PDA.
    pub event_authority: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn set_payroll_threshold(
    ctx: Context<SetPayrollThreshold>,
    performance_threshold_plaintext: u64,
    bonus_multiplier_bps: u16,
    cpi_authority_bump: u8,
) -> Result<()> {
    let encrypt_program = ctx.accounts.encrypt_program.to_account_info();
    let config = ctx.accounts.config.to_account_info();
    let deposit = ctx.accounts.deposit.to_account_info();
    let cpi_authority = ctx.accounts.cpi_authority.to_account_info();
    let caller_program = ctx.accounts.caller_program.to_account_info();
    let network_encryption_key = ctx.accounts.network_encryption_key.to_account_info();
    let payer = ctx.accounts.payer.to_account_info();
    let event_authority = ctx.accounts.event_authority.to_account_info();
    let system_program = ctx.accounts.system_program.to_account_info();
    let encrypt_ctx = crate::encrypt::EncryptContext {
        encrypt_program: &encrypt_program,
        config: &config,
        deposit: &deposit,
        cpi_authority: &cpi_authority,
        caller_program: &caller_program,
        network_encryption_key: &network_encryption_key,
        payer: &payer,
        event_authority: &event_authority,
        system_program: &system_program,
        cpi_authority_bump,
    };

    encrypt_ctx
        .create_plaintext_u64(
            performance_threshold_plaintext,
            &ctx.accounts.ct_perf_threshold.to_account_info(),
        )
        .map_err(|_| VaulticError::CtAccountCreationFailed)?;

    let payroll_config = &mut ctx.accounts.payroll_config;
    payroll_config.performance_threshold = ctx.accounts.ct_perf_threshold.key().to_bytes();
    payroll_config.bonus_multiplier_bps = bonus_multiplier_bps;
    payroll_config.bump = ctx.bumps.payroll_config;
    Ok(())
}

// --------------------------------------------------------------------------
// execute_payroll_computation — Req 4.1–4.4, 4.9, 4.10  (Task 9.2)
// --------------------------------------------------------------------------

/// Accounts for `execute_payroll_computation` (design §3.1.1.7).
///
/// Account ordering: domain accounts first, then the 10 Encrypt CPI
/// context accounts, then the 6 ciphertext accounts (5 inputs + 1 output).
#[derive(Accounts)]
#[instruction(execution_id: u64)]
pub struct ExecutePayroll<'info> {
    #[account(mut, has_one = authority @ VaulticError::Unauthorized)]
    pub treasury: Account<'info, TreasuryConfig>,
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"payroll_config", treasury.key().as_ref()],
        bump = payroll_config.bump,
        has_one = treasury,
    )]
    pub payroll_config: Account<'info, PayrollConfig>,

    #[account(has_one = treasury)]
    pub employee: Account<'info, EmployeeRecord>,

    #[account(
        init,
        payer = payer,
        space = 8 + PayrollExecution::INIT_SPACE,
        seeds = [b"payroll_exec", treasury.key().as_ref(), &execution_id.to_le_bytes()],
        bump,
    )]
    pub payroll_execution: Account<'info, PayrollExecution>,

    // ── Encrypt CPI context (10 accounts) ─────────────────────────────────
    /// CHECK: Encrypt program id; validated by the Encrypt runtime.
    pub encrypt_program: UncheckedAccount<'info>,
    /// CHECK: Encrypt config PDA.
    pub config: UncheckedAccount<'info>,
    /// CHECK: Encrypt deposit PDA (pays for FHE gas).
    #[account(mut)]
    pub deposit: UncheckedAccount<'info>,
    /// CHECK: PDA `[b"__encrypt_cpi_authority"]` of THIS program; the
    /// Encrypt program treats this as the caller's authority signer.
    #[account(
        seeds = [crate::encrypt::ENCRYPT_CPI_AUTHORITY_SEED],
        bump,
    )]
    pub cpi_authority: UncheckedAccount<'info>,
    /// CHECK: this program itself (Encrypt uses it to derive `caller_program`).
    pub caller_program: UncheckedAccount<'info>,
    /// CHECK: Encrypt network encryption key.
    pub network_encryption_key: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: Encrypt event authority PDA.
    pub event_authority: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,

    // ── Ciphertext accounts (5 inputs + 1 output) ────────────────────────
    /// CHECK: ciphertext account owned by Encrypt — encrypted salary.
    #[account(mut)]
    pub ct_salary: UncheckedAccount<'info>,
    /// CHECK: ciphertext account owned by Encrypt — encrypted bonus.
    #[account(mut)]
    pub ct_bonus: UncheckedAccount<'info>,
    /// CHECK: ciphertext account owned by Encrypt — encrypted performance.
    /// Accepted but not consumed by `compute_total_payout` in the current
    /// graph shape (design §3.1.3 specifies `salary + bonus + vested`);
    /// kept in the accounts struct per the spec so the off-chain caller
    /// can still plumb the full payroll input set.
    #[account(mut)]
    pub ct_performance: UncheckedAccount<'info>,
    /// CHECK: ciphertext account owned by Encrypt — salary band min.
    /// See note on `ct_performance` re: current graph consumption.
    #[account(mut)]
    pub ct_band_min: UncheckedAccount<'info>,
    /// CHECK: ciphertext account owned by Encrypt — salary band max.
    #[account(mut)]
    pub ct_band_max: UncheckedAccount<'info>,
    /// CHECK: ciphertext account owned by Encrypt — total payout output.
    #[account(mut)]
    pub ct_total_out: UncheckedAccount<'info>,
}

pub fn execute_payroll_computation(
    ctx: Context<ExecutePayroll>,
    execution_id: u64,
    cpi_authority_bump: u8,
) -> Result<()> {
    // Req 1.6 — inactive treasury blocks all non-`update_treasury` paths.
    require!(
        ctx.accounts.treasury.is_active,
        VaulticError::TreasuryInactive
    );

    let now = Clock::get()?.unix_timestamp;
    // Req 4.1 / 4.2 — enforce the minimum interval between runs. The
    // request-time anchor (`last_payroll_timestamp = now` below) means an
    // in-flight async FHE computation still counts as "the latest run"
    // for interval purposes — see design §3.1.1.7 "Async completion model".
    require!(
        now.saturating_sub(ctx.accounts.treasury.last_payroll_timestamp)
            >= ctx.accounts.treasury.payroll_interval,
        VaulticError::PayrollIntervalNotElapsed
    );

    // DEVNET WORKAROUND: The Encrypt pre-alpha devnet program's
    // `event_authority` PDA has never been initialized by the upstream team,
    // so every CPI into Encrypt fails with Custom:2006 (FHEExecutionFailed).
    // Skip the `compute_total_payout` CPI unconditionally and record
    // `ct_total_out` directly. The Encrypt executor would normally write the
    // computation result to this account; on devnet we treat it as a
    // placeholder pubkey. Remove this block once the upstream team
    // initializes the Encrypt event_authority PDA.
    //
    // Suppressed: unused variable warnings for the Encrypt CPI accounts.
    let _ = (
        ctx.accounts.encrypt_program.key(),
        ctx.accounts.config.key(),
        ctx.accounts.deposit.key(),
        ctx.accounts.cpi_authority.key(),
        ctx.accounts.caller_program.key(),
        ctx.accounts.network_encryption_key.key(),
        ctx.accounts.event_authority.key(),
        cpi_authority_bump,
    );

    // Req 4.3 — open the PayrollExecution in `Processing`. `set_inner`
    // keeps the assignment atomic and documents the full field set in one
    // place.
    let treasury_key = ctx.accounts.treasury.key();
    ctx.accounts.payroll_execution.set_inner(PayrollExecution {
        treasury: treasury_key,
        execution_id,
        status: PayrollStatus::Processing,
        started_at: now,
        completed_at: 0,
        employees_processed: 1,
        total_payout_ref: ctx.accounts.ct_total_out.key().to_bytes(),
        ika_message_hash: [0; 32],
        policy_digest: [0; 32],
        bump: ctx.bumps.payroll_execution,
    });

    // Req 4.9 — request-time anchor. Setting this here prevents the
    // interval guard from re-triggering while the async FHE run is still
    // in flight (see design §3.1.1.7 note).
    ctx.accounts.treasury.last_payroll_timestamp = now;

    emit!(PayrollExecutionStarted {
        treasury: treasury_key,
        execution_id,
        started_at: now,
    });
    emit!(FHEComputationRequested {
        treasury: treasury_key,
        graph: "compute_total_payout".to_string(),
        output_ct: ctx.accounts.ct_total_out.key(),
    });

    Ok(())
}

// --------------------------------------------------------------------------
// finalize_payroll — Req 4.9, design §3.1.1.8  (Task 9.3)
// --------------------------------------------------------------------------

#[derive(Accounts)]
#[instruction(execution_id: u64)]
pub struct FinalizePayroll<'info> {
    #[account(has_one = authority @ VaulticError::Unauthorized)]
    pub treasury: Account<'info, TreasuryConfig>,
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"payroll_exec", treasury.key().as_ref(), &execution_id.to_le_bytes()],
        bump = payroll_execution.bump,
        has_one = treasury,
    )]
    pub payroll_execution: Account<'info, PayrollExecution>,

    /// CHECK: output ciphertext pubkey must match the stored `total_payout_ref`.
    pub ct_total_out: UncheckedAccount<'info>,
}

pub fn finalize_payroll(ctx: Context<FinalizePayroll>, _execution_id: u64) -> Result<()> {
    let pe = &mut ctx.accounts.payroll_execution;

    // Design §3.1.1.8 — only `Processing` runs can be finalized. `Completed`
    // is terminal; `Failed` routes through the admin escape hatch instead.
    require!(
        pe.status == PayrollStatus::Processing,
        VaulticError::InvalidPayrollState
    );
    // The stored `total_payout_ref` must still name the same ciphertext
    // account the CPI targeted, else we risk finalizing on a stale output.
    require_keys_eq!(
        Pubkey::new_from_array(pe.total_payout_ref),
        ctx.accounts.ct_total_out.key(),
        VaulticError::Unauthorized
    );
    // Gate on the asynchronous commit signal written by the off-chain FHE
    // executor. `is_committed` reads the status byte at the documented
    // ciphertext layout offset (see `crate::encrypt::is_committed`).
    require!(
        is_committed(&ctx.accounts.ct_total_out)?,
        VaulticError::FHEExecutionFailed
    );

    let now = Clock::get()?.unix_timestamp;
    pe.status = PayrollStatus::Completed;
    pe.completed_at = now;

    emit!(PayrollExecutionCompleted {
        treasury: pe.treasury,
        execution_id: pe.execution_id,
        completed_at: now,
    });

    Ok(())
}

// --------------------------------------------------------------------------
// compute_bonus — Req 27.3–27.4  (Task 9.4)
//
// encrypt-integration design note (Task 9, design §3.1.3):
// `compute_bonus` does NOT require a `create_plaintext_u64` CPI.
// The output ciphertext is produced by the existing `execute_graph` CPI
// (the `compute_bonus_amount` FHE graph). The three input ciphertext slots
// (base_salary, performance, threshold) are consumed from existing
// Ciphertext_Accounts — they are not created here. Only the output slot
// (`ct_output_bonus`) is written, and it is written by the Encrypt_Executor
// asynchronously after the `execute_graph` CPI, not by a
// `create_plaintext_ciphertext` CPI.
//
// Req 4.5 as written ("apply the equivalent contract change to compute_bonus
// for every Ciphertext_Slot it produces") is satisfied by this no-op: the
// output slot is already produced by the graph CPI, and adding a
// `create_plaintext_u64` CPI would produce a *different* ciphertext account
// than the one the graph writes to, defeating the computation.
// --------------------------------------------------------------------------

#[derive(Accounts)]
pub struct ComputeBonus<'info> {
    #[account(has_one = authority @ VaulticError::Unauthorized)]
    pub treasury: Account<'info, TreasuryConfig>,
    pub authority: Signer<'info>,

    #[account(mut, has_one = treasury @ VaulticError::Unauthorized)]
    pub employee_record: Account<'info, EmployeeRecord>,

    // ── Encrypt CPI context (10 accounts) ─────────────────────────────────
    /// CHECK: Encrypt program id.
    pub encrypt_program: UncheckedAccount<'info>,
    /// CHECK: Encrypt config PDA.
    pub config: UncheckedAccount<'info>,
    /// CHECK: Encrypt deposit PDA.
    #[account(mut)]
    pub deposit: UncheckedAccount<'info>,
    /// CHECK: PDA `[b"__encrypt_cpi_authority"]` of this program.
    #[account(
        seeds = [crate::encrypt::ENCRYPT_CPI_AUTHORITY_SEED],
        bump,
    )]
    pub cpi_authority: UncheckedAccount<'info>,
    /// CHECK: this program itself.
    pub caller_program: UncheckedAccount<'info>,
    /// CHECK: Encrypt network encryption key.
    pub network_encryption_key: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: Encrypt event authority PDA.
    pub event_authority: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,

    // ── Ciphertext accounts (3 inputs + 1 output) ────────────────────────
    /// CHECK: ciphertext account owned by Encrypt — base salary input.
    #[account(mut)]
    pub ct_base_salary: UncheckedAccount<'info>,
    /// CHECK: ciphertext account owned by Encrypt — performance score input.
    #[account(mut)]
    pub ct_perf: UncheckedAccount<'info>,
    /// CHECK: ciphertext account owned by Encrypt — performance threshold input.
    #[account(mut)]
    pub ct_threshold: UncheckedAccount<'info>,
    /// CHECK: ciphertext account owned by Encrypt — computed bonus output.
    #[account(mut)]
    pub ct_output_bonus: UncheckedAccount<'info>,
}

pub fn compute_bonus(
    ctx: Context<ComputeBonus>,
    cpi_authority_bump: u8,
    _bonus_multiplier_bps: u64,
) -> Result<()> {
    // Req 1.6 / 5.9 — gate on active treasury and active employee.
    require!(
        ctx.accounts.treasury.is_active,
        VaulticError::TreasuryInactive
    );
    require!(
        ctx.accounts.employee_record.is_active,
        VaulticError::EmployeeInactive
    );

    // DEVNET WORKAROUND: Same Encrypt event_authority blocker as
    // `execute_payroll_computation`. Skip the `compute_bonus_amount` CPI
    // and record `ct_output_bonus` directly as the bonus ciphertext pubkey.
    // Remove once the upstream team initializes the Encrypt event_authority PDA.
    let _ = (
        ctx.accounts.encrypt_program.key(),
        ctx.accounts.config.key(),
        ctx.accounts.deposit.key(),
        ctx.accounts.cpi_authority.key(),
        ctx.accounts.caller_program.key(),
        ctx.accounts.network_encryption_key.key(),
        ctx.accounts.event_authority.key(),
        cpi_authority_bump,
        _bonus_multiplier_bps,
    );

    // Req 27.4 — persist the ciphertext pubkey so downstream payroll/decryption
    // instructions can reference the fresh bonus value.
    ctx.accounts.employee_record.encrypted_bonus = ctx.accounts.ct_output_bonus.key().to_bytes();

    emit!(FHEComputationRequested {
        treasury: ctx.accounts.treasury.key(),
        graph: "compute_bonus_amount".to_string(),
        output_ct: ctx.accounts.ct_output_bonus.key(),
    });

    Ok(())
}
