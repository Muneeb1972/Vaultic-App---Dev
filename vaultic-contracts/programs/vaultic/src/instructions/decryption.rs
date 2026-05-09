//! FHE salary decryption instructions — Req 5 (privacy-critical).
//!
//! - `request_salary_decryption` (Req 5.1–5.2): CPI to the Encrypt
//!   `request_decryption` entrypoint, snapshots the returned 32-byte
//!   `ciphertext_digest` into `EmployeeRecord.pending_digest`, and emits a
//!   `DecryptionRequested` event.
//! - `reveal_salary` (Req 5.3–5.9): re-reads the `DecryptionRequest` account
//!   via `read_decrypted_verified::<Uint64>`, returns the plaintext salary
//!   through Solana transaction return-data, zeroes the pending digest for
//!   replay protection, and emits `SalaryRevealed` (no amount).
//!
//! ## Privacy invariants (Req 5.4, 5.5 — do not weaken)
//!
//! Plaintext salary values MUST leave the chain **exclusively** through
//! `anchor_lang::solana_program::program::set_return_data`. The return-data
//! channel is scoped to the invoking transaction and is not persisted into
//! any account or log. Writing the plaintext anywhere else — a field on an
//! account, an `emit!` event payload, a `msg!` log line, even a transient
//! debug trace — breaks the privacy guarantee that motivates the entire FHE
//! stack. Future maintainers: if you feel the urge to "make the return
//! easier to consume off-chain" by stashing it somewhere, stop and re-read
//! requirement 5.4.
//!
//! Similarly, `EmployeeRecord.pending_digest` MUST be zeroed immediately
//! after a successful reveal (Req 5.5). The digest is the replay ticket; a
//! non-zero digest after a reveal lets the same plaintext be re-materialised
//! across transactions. The zeroing happens on the success path only — a
//! `DecryptionNotComplete` error leaves the digest intact so the employee
//! can retry after the decryptor finishes writing.

use anchor_lang::prelude::*;

use crate::errors::VaulticError;
use crate::events::{DecryptionRequested, SalaryRevealed};
use crate::fhe;
use crate::state::{EmployeeRecord, TreasuryConfig};

// --------------------------------------------------------------------------
// request_salary_decryption — Req 5.1–5.2  (Task 10.1)
// --------------------------------------------------------------------------

/// Accounts for `request_salary_decryption` (design §3.1.1.10).
///
/// The `decryption_request` account is a **fresh keypair signer** — the
/// Encrypt program will `init` it during the CPI as a new `DecryptionRequest`
/// PDA-style account, so it must arrive writable and signed. Anchor's own
/// `#[account(init)]` cannot be used here because ownership transfers to
/// Encrypt, not to this program.
///
/// The `ct_salary` account is constrained via `address = ..` to match the
/// ciphertext pubkey stored in `EmployeeRecord.encrypted_salary`; this
/// prevents a malicious caller from substituting a different ciphertext
/// (for example, another employee's salary) at the CPI boundary.
#[derive(Accounts)]
#[instruction(cpi_authority_bump: u8)]
pub struct RequestSalaryDecryption<'info> {
    #[account(
        mut,
        has_one = treasury @ VaulticError::Unauthorized,
        has_one = employee_wallet @ VaulticError::Unauthorized,
    )]
    pub employee_record: Account<'info, EmployeeRecord>,

    pub treasury: Account<'info, TreasuryConfig>,

    /// The employee initiating the decryption request (Req 5.1). Signer
    /// check plus the `has_one = employee_wallet` on `employee_record`
    /// together satisfy Req 5.8 for this instruction.
    pub employee_wallet: Signer<'info>,

    /// Pays rent for the Encrypt-owned `DecryptionRequest` account and for
    /// any Encrypt-side bookkeeping. Kept separate from `employee_wallet`
    /// so the treasury authority (or a relayer) can cover costs without
    /// requiring the employee to hold SOL.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: fresh keypair signer. The Encrypt CPI initialises this
    /// account as a `DecryptionRequest` on the first call; subsequent
    /// reveals read its data via `read_decrypted_verified`.
    #[account(mut, signer)]
    pub decryption_request: UncheckedAccount<'info>,

    /// CHECK: ciphertext account owned by the Encrypt program. The
    /// `address = Pubkey::new_from_array(..)` constraint pins this to the
    /// employee's registered `encrypted_salary` ciphertext so no other
    /// ciphertext can be substituted.
    #[account(
        mut,
        address = Pubkey::new_from_array(employee_record.encrypted_salary),
    )]
    pub ct_salary: UncheckedAccount<'info>,

    // ── Encrypt CPI context (9 accounts) ──────────────────────────────────
    //
    // Mirrors the layout used by `ExecutePayroll` / `ComputeBonus` in
    // `instructions/payroll.rs`. The same nine accounts travel with every
    // Encrypt CPI; the tenth `payer` slot is filled by `authority` above.
    /// CHECK: Encrypt program id.
    pub encrypt_program: UncheckedAccount<'info>,
    /// CHECK: Encrypt config PDA.
    pub config: UncheckedAccount<'info>,
    /// CHECK: Encrypt deposit PDA (pays for FHE gas).
    #[account(mut)]
    pub deposit: UncheckedAccount<'info>,
    /// CHECK: PDA `[b"__encrypt_cpi_authority"]` of THIS program; the
    /// Encrypt program treats this as our caller authority signer.
    #[account(
        seeds = [crate::encrypt::ENCRYPT_CPI_AUTHORITY_SEED],
        bump = cpi_authority_bump,
    )]
    pub encrypt_cpi_authority: UncheckedAccount<'info>,
    /// CHECK: this program itself (Encrypt uses it to derive `caller_program`).
    pub caller_program: UncheckedAccount<'info>,
    /// CHECK: Encrypt network encryption key.
    pub network_encryption_key: UncheckedAccount<'info>,
    /// CHECK: Encrypt event authority PDA.
    pub event_authority: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn request_salary_decryption(
    ctx: Context<RequestSalaryDecryption>,
    cpi_authority_bump: u8,
) -> Result<()> {
    // Req 1.6 / 5.9 — decryption is blocked while the treasury or the
    // employee record is inactive. Checking both here lets callers fail
    // fast before spending the Encrypt deposit.
    require!(
        ctx.accounts.treasury.is_active,
        VaulticError::TreasuryInactive
    );
    require!(
        ctx.accounts.employee_record.is_active,
        VaulticError::EmployeeInactive
    );

    // Req 5.1 — CPI to the Encrypt program (design §3.1.1.10). Build the
    // `EncryptContext` struct literal from our accounts; `to_account_info`
    // values are bound to `let`s so the `&` references in the struct don't
    // point at temporaries.
    let encrypt_program = ctx.accounts.encrypt_program.to_account_info();
    let config = ctx.accounts.config.to_account_info();
    let deposit = ctx.accounts.deposit.to_account_info();
    let cpi_authority = ctx.accounts.encrypt_cpi_authority.to_account_info();
    let caller_program = ctx.accounts.caller_program.to_account_info();
    let network_encryption_key = ctx.accounts.network_encryption_key.to_account_info();
    let payer = ctx.accounts.authority.to_account_info();
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
    let ct_salary_info = ctx.accounts.ct_salary.to_account_info();
    let decryption_request_info = ctx.accounts.decryption_request.to_account_info();
    let digest: [u8; 32] =
        fhe::request_decryption_cpi(&encrypt_ctx, &ct_salary_info, &decryption_request_info)
            .map_err(|_| VaulticError::FHEExecutionFailed)?;

    // Req 5.2 — snapshot the ciphertext digest for later verification by
    // `reveal_salary`. A non-zero `pending_digest` after this instruction
    // indicates a decryption is in flight; the field is zeroed again on
    // reveal (Req 5.5) to close the replay window.
    ctx.accounts.employee_record.pending_digest = digest;

    emit!(DecryptionRequested {
        employee: ctx.accounts.employee_record.employee_wallet,
    });

    Ok(())
}

// --------------------------------------------------------------------------
// reveal_salary — Req 5.3–5.9  (Task 10.2, PRIVACY-CRITICAL)
// --------------------------------------------------------------------------

/// Accounts for `reveal_salary` (design §3.1.1.10).
///
/// Held to the minimum surface: the employee record, the parent treasury
/// (for `has_one` validation), the employee's signing wallet, and the
/// `DecryptionRequest` account whose bytes we verify. No Encrypt CPI
/// context accounts are needed because `read_decrypted_verified` reads
/// the request's raw data directly — the call does not re-enter the
/// Encrypt program.
#[derive(Accounts)]
pub struct RevealSalary<'info> {
    #[account(
        mut,
        has_one = treasury @ VaulticError::Unauthorized,
        has_one = employee_wallet @ VaulticError::Unauthorized,
    )]
    pub employee_record: Account<'info, EmployeeRecord>,

    pub treasury: Account<'info, TreasuryConfig>,

    /// Req 5.8 — the employee's wallet MUST sign. The `has_one` on
    /// `employee_record` above ties this signer to the stored
    /// `employee_wallet` field. The explicit `require!` on
    /// `employee_wallet.key() == employee_record.employee_wallet` in the
    /// body is a belt-and-braces check against any Anchor behaviour change.
    pub employee_wallet: Signer<'info>,

    /// CHECK: `DecryptionRequest` account initialised by a prior
    /// `request_salary_decryption`. `read_decrypted_verified` reads its
    /// raw data; the verification checks `bytes_written == total_len` (Req
    /// 5.7) and `ciphertext_digest == pending_digest` (Req 5.6).
    pub decryption_request: UncheckedAccount<'info>,
}

pub fn reveal_salary(ctx: Context<RevealSalary>) -> Result<()> {
    // Req 5.8 — the requesting wallet must be the employee. The `has_one`
    // constraint above already enforces this via Anchor; the explicit
    // comparison here is a defence-in-depth check so an accidental
    // loosening of the accounts struct cannot silently bypass Req 5.8.
    require_keys_eq!(
        ctx.accounts.employee_wallet.key(),
        ctx.accounts.employee_record.employee_wallet,
        VaulticError::Unauthorized
    );

    // Req 5.9 — inactive employees cannot decrypt.
    require!(
        ctx.accounts.employee_record.is_active,
        VaulticError::EmployeeInactive
    );

    // Reqs 5.3, 5.6, 5.7 — borrow the DecryptionRequest raw data and call
    // into the Encrypt helper. Both "not yet fully written"
    // (bytes_written < total_len) and "digest mismatch" map to
    // `DecryptionNotComplete`, per the upstream `read_decrypted_verified`
    // contract (see `crate::encrypt::read_decrypted_verified` docs).
    let req_info = ctx.accounts.decryption_request.to_account_info();
    let req_data = req_info.try_borrow_data()?;
    let salary: u64 =
        fhe::read_decrypted_verified_cpi(&req_data, ctx.accounts.employee_record.pending_digest)
            .map_err(|_| VaulticError::DecryptionNotComplete)?;
    drop(req_data);

    // ────────────────────────────────────────────────────────────────────
    // PRIVACY INVARIANT — Req 5.4 (DO NOT WEAKEN).
    //
    // Plaintext salary leaves the chain EXCLUSIVELY through `set_return_data`.
    // This channel is scoped to the invoking transaction's return buffer
    // and is not persisted to any account, log, or event. Do NOT:
    //   - write `salary` onto `EmployeeRecord` or any other account,
    //   - include `salary` in `emit!(SalaryRevealed { .. })`,
    //   - print `salary` via `msg!` or debug formatting,
    //   - pass `salary` through any CPI outside this transaction.
    // Any of the above breaks the FHE privacy guarantee documented in
    // requirements.md §Requirement 5 and design.md §3.1.1.10.
    // ────────────────────────────────────────────────────────────────────
    anchor_lang::solana_program::program::set_return_data(&salary.to_le_bytes());

    // ────────────────────────────────────────────────────────────────────
    // REPLAY GUARD — Req 5.5 (DO NOT REMOVE).
    //
    // The pending_digest is the replay ticket for this decryption. Once
    // the plaintext has been surfaced to the employee via return-data,
    // the ticket MUST be invalidated so the same decrypted value cannot
    // be re-materialised on a later `reveal_salary` call. Zeroing is
    // correct here only because we reach this line on the success path —
    // the `DecryptionNotComplete` branch above returns early and leaves
    // the digest intact so the employee can retry.
    // ────────────────────────────────────────────────────────────────────
    ctx.accounts.employee_record.pending_digest = [0u8; 32];

    // Req 5.4 (event-side) — the `SalaryRevealed` event is signal-only.
    // Its struct deliberately carries no amount field (see `events.rs`).
    // Off-chain indexers learn that a reveal happened; they do not learn
    // what was revealed.
    emit!(SalaryRevealed {
        employee: ctx.accounts.employee_record.employee_wallet,
    });

    Ok(())
}
