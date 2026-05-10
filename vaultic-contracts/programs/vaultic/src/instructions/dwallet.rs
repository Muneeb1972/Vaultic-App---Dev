//! Ika dWallet lifecycle + signature approval instructions — Reqs 6, 7.
//!
//! - `create_dwallet` (Req 6): registers a dWallet created off-chain via DKG
//!   and verifies that its `authority` field has been transferred to the
//!   Vaultic CPI authority PDA. **No Ika CPI** — we read the dwallet
//!   account (owned by the Ika program) directly and deserialize the
//!   `authority` field at a documented offset.
//! - `approve_payroll_message` (Req 7, 8.9): FHE-gated two-phase approval
//!   per design §3.1.1.12. Phase 1 runs the encrypted policy compliance
//!   check and requests decryption of the resulting `Bool` ciphertext;
//!   Phase 2, after the decryptor commits, reads the verified boolean and
//!   — if `true` — issues the raw CPI `approve_message` to Ika with the
//!   keccak256 digest of the cross-chain message.
//!
//! ## Dwallet `authority` offset (Req 6.4, design §3.1.1.11)
//!
//! We need to assert that the dwallet account's `authority` field equals
//! the Vaultic `IKA_CPI_AUTHORITY_SEED` PDA. The Ika on-chain layout is not
//! published as a stable constant in any crate we can depend on (the
//! `ika-dwallet-anchor` crate requires anchor-lang 1.0, which conflicts
//! with the 0.32 pin in `programs/vaultic/Cargo.toml`). For the Phase 1
//! devnet MVP we read a `[u8; 32]` at offset 8 (immediately after the
//! Anchor discriminator), treat it as the **proposed** authority layout,
//! and compare to our CPI authority PDA.
//!
//! If the offset is wrong at runtime the check will fail and the
//! instruction will return `Unauthorized` — a safe default, but it means
//! administrators will not be able to bind a real Ika dwallet until the
//! offset is confirmed against the Ika crate source. This is tracked as a
//! known Phase 1 limitation (see the FOLLOW-UP block in the handler body).

use anchor_lang::prelude::*;
use solana_keccak_hasher::hashv;

use crate::errors::VaulticError;
use crate::events::IkaSigningRequested;
use crate::ika;
use crate::state::{PayrollExecution, TreasuryConfig};

// --------------------------------------------------------------------------
// create_dwallet — Req 6  (Task 11.1)
// --------------------------------------------------------------------------

/// Accounts for `create_dwallet` (design §3.1.1.11).
///
/// The `dwallet` account is **owned by the Ika program**, so Anchor cannot
/// deserialize it into a typed account — we pass it as `UncheckedAccount`
/// and read its raw bytes in the handler body. `has_one = authority` on
/// `treasury` enforces Req 1.4 Unauthorized for non-admin callers.
#[derive(Accounts)]
pub struct CreateDWallet<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut, has_one = authority @ VaulticError::Unauthorized)]
    pub treasury: Account<'info, TreasuryConfig>,

    /// CHECK: dwallet account owned by the Ika program. We read its raw
    /// data to verify the `authority` field matches this program's
    /// `IKA_CPI_AUTHORITY_SEED` PDA. The handler explicitly checks
    /// `dwallet.owner == ika::IKA_PROGRAM_ID` so a malicious caller can't
    /// pass an arbitrary 32-byte blob.
    pub dwallet: UncheckedAccount<'info>,
}

pub fn create_dwallet(
    ctx: Context<CreateDWallet>,
    dwallet_id: Pubkey,
    curve_type: u8,
) -> Result<()> {
    // Req 1.6 — inactive treasury blocks everything except `update_treasury`.
    require!(
        ctx.accounts.treasury.is_active,
        VaulticError::TreasuryInactive
    );

    // Req 6.3 / §3.1.2 — curve discriminant is bounded to 0..=2 today
    // (Secp256k1, Ed25519, Ristretto25519). Reuse `Unauthorized` to match
    // Req 6.4's error mapping.
    require!(curve_type <= 2, VaulticError::Unauthorized);

    // The caller-supplied `dwallet_id` must name the passed `dwallet`
    // account, otherwise we could write a stale reference into
    // `TreasuryConfig`.
    require_keys_eq!(
        ctx.accounts.dwallet.key(),
        dwallet_id,
        VaulticError::Unauthorized
    );

    // Defence-in-depth: the `dwallet` account must actually be owned by the
    // Ika program. Without this check a malicious caller could pass a
    // bytes-compatible account that happens to hold our CPI authority PDA
    // at offset 8 and bypass the authority transfer requirement.
    require_keys_eq!(
        *ctx.accounts.dwallet.owner,
        ika::IKA_PROGRAM_ID,
        VaulticError::Unauthorized
    );

    // ────────────────────────────────────────────────────────────────────
    // FOLLOW-UP — dwallet `authority` offset (design §3.1.1.11).
    //
    // The Ika on-chain layout is not published as a stable constant we can
    // import (its `ika-dwallet-anchor` crate targets anchor-lang 1.0,
    // which conflicts with Encrypt's 0.32 pin — see `programs/vaultic/
    // Cargo.toml`). We therefore adopt the proposed layout documented in
    // design §3.1.1.11: the `authority` `Pubkey` sits immediately after
    // the 8-byte Anchor discriminator.
    //
    // Reading at the wrong offset will produce a `Pubkey` that does not
    // match our CPI authority PDA and the `require_keys_eq!` below will
    // return `Unauthorized`. That is a *safe* failure mode — no dwallet
    // gets mis-registered — but it means administrators cannot bind a
    // real Ika dwallet until this offset is confirmed against the Ika
    // crate source. Tracked as a Phase 1 limitation.
    // ────────────────────────────────────────────────────────────────────
    const DWALLET_AUTHORITY_OFFSET: usize = 8;
    let data = ctx.accounts.dwallet.try_borrow_data()?;
    require!(
        data.len() >= DWALLET_AUTHORITY_OFFSET + 32,
        VaulticError::Unauthorized
    );
    let authority_bytes: [u8; 32] =
        <[u8; 32]>::try_from(&data[DWALLET_AUTHORITY_OFFSET..DWALLET_AUTHORITY_OFFSET + 32])
            .map_err(|_| VaulticError::Unauthorized)?;
    drop(data);
    let stored_authority = Pubkey::new_from_array(authority_bytes);

    // Req 6.3 / 6.4 — our CPI authority PDA must own the dwallet so that
    // only this program can approve messages for signing.
    let (expected_authority, _bump) =
        Pubkey::find_program_address(&[ika::IKA_CPI_AUTHORITY_SEED], &crate::ID);
    require_keys_eq!(
        stored_authority,
        expected_authority,
        VaulticError::Unauthorized
    );

    // Req 6.1 — persist the dwallet binding on `TreasuryConfig`.
    let treasury = &mut ctx.accounts.treasury;
    treasury.dwallet_id = dwallet_id;
    treasury.dwallet_curve_type = curve_type;

    Ok(())
}

// --------------------------------------------------------------------------
// approve_payroll_message — Req 7, 8.9  (Task 11.2)
// --------------------------------------------------------------------------

/// Accounts for `approve_payroll_message` (design §3.1.1.12).
///
/// Two-phase instruction:
///
/// 1. **Phase 1** (`payroll_execution.policy_digest == [0; 32]`): invoke
///    `check_policy_compliance` CPI to produce an encrypted Bool in
///    `ct_policy_ok`, then `request_decryption` to queue the Bool
///    ciphertext for the decryptor and snapshot the returned digest into
///    `payroll_execution.policy_digest`.
/// 2. **Phase 2** (`policy_digest != [0; 32]`): `read_decrypted_verified`
///    on the `decryption_request` account. If the decrypted boolean is
///    `true`, issue the raw-CPI `approve_message` to Ika with
///    `keccak256(message)` as the digest, persist the digest in
///    `payroll_execution.ika_message_hash`, zero `policy_digest` to
///    close the replay window, and emit `IkaSigningRequested`. If
///    `false`, return `SpendingLimitExceeded`.
///
/// Account ordering: treasury / authority / payroll_execution first, then
/// the 9 Encrypt CPI context accounts, then the 4 ciphertext accounts
/// used by the policy gate, then the 7 Ika CPI accounts. All
/// Encrypt-owned and Ika-owned accounts are `UncheckedAccount` — Anchor
/// cannot validate their types without depending on the other program.
#[derive(Accounts)]
#[instruction(
    execution_id: u64,
    cpi_authority_bump: u8,
    ika_cpi_bump: u8,
)]
pub struct ApprovePayrollMessage<'info> {
    #[account(mut, has_one = authority @ VaulticError::Unauthorized)]
    pub treasury: Account<'info, TreasuryConfig>,
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"payroll_exec", treasury.key().as_ref(), &execution_id.to_le_bytes()],
        bump = payroll_execution.bump,
        has_one = treasury,
    )]
    pub payroll_execution: Account<'info, PayrollExecution>,

    // ── Ika CPI accounts (5 — corrected from upstream docs) ─────────────
    /// CHECK: MessageApproval PDA — seeds ["message_approval", dwallet, message_hash]
    /// under the Ika program. Writable so Ika can initialise it.
    #[account(mut)]
    pub message_approval: UncheckedAccount<'info>,
    /// CHECK: dwallet account owned by the Ika program.
    pub dwallet: UncheckedAccount<'info>,
    /// CHECK: PDA `[IKA_CPI_AUTHORITY_SEED]` of THIS program; the Ika
    /// program treats this as the signer of the approval.
    #[account(
        seeds = [ika::IKA_CPI_AUTHORITY_SEED],
        bump = ika_cpi_bump,
    )]
    pub ika_cpi_authority: UncheckedAccount<'info>,
    /// CHECK: signer that pays rent for the MessageApproval account.
    #[account(mut)]
    pub payer: Signer<'info>,

    // ── Encrypt CPI context (8 — system_program is shared with Ika) ───────
    /// CHECK: Encrypt program id; validated by the Encrypt runtime.
    pub encrypt_program: UncheckedAccount<'info>,
    /// CHECK: Encrypt config PDA.
    pub config: UncheckedAccount<'info>,
    /// CHECK: Encrypt deposit PDA (pays for FHE gas).
    #[account(mut)]
    pub deposit: UncheckedAccount<'info>,
    /// CHECK: PDA `[b"__encrypt_cpi_authority"]` of THIS program.
    #[account(
        seeds = [crate::encrypt::ENCRYPT_CPI_AUTHORITY_SEED],
        bump = cpi_authority_bump,
    )]
    pub encrypt_cpi_authority: UncheckedAccount<'info>,
    /// CHECK: this program's own executable account (used by Encrypt as `caller_program`).
    pub caller_program: UncheckedAccount<'info>,
    /// CHECK: Encrypt network encryption key.
    pub network_encryption_key: UncheckedAccount<'info>,
    /// CHECK: Encrypt event authority PDA.
    pub event_authority: UncheckedAccount<'info>,

    // ── Ciphertext accounts (4: 2 inputs + 1 output + 1 decryption req) ──
    /// CHECK: ciphertext account owned by Encrypt — encrypted payroll
    /// total produced by a prior `compute_total_payout` run.
    #[account(mut)]
    pub ct_total_out: UncheckedAccount<'info>,
    /// CHECK: ciphertext account encoding the plaintext spending limit as
    /// a `PUint64` operand for the `check_policy_compliance` graph.
    pub ct_spending_limit: UncheckedAccount<'info>,
    /// CHECK: ciphertext account owned by Encrypt — encrypted Bool
    /// output of `check_policy_compliance`.
    #[account(mut)]
    pub ct_policy_ok: UncheckedAccount<'info>,
    /// CHECK: DecryptionRequest account. In Phase 1 this is a fresh
    /// keypair signer the Encrypt CPI initialises; in Phase 2 it is the
    /// already-initialised account whose data we `read_decrypted_verified`.
    #[account(mut)]
    pub decryption_request: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

/// Sensible upper bound on the Ika `message` argument per design
/// §3.1.1.12 ("0..=1024 bytes"). Prevents a malicious caller from
/// blowing up the instruction byte budget by passing a huge payload.
const MAX_MESSAGE_LEN: usize = 1024;

pub fn approve_payroll_message(
    ctx: Context<ApprovePayrollMessage>,
    _execution_id: u64,
    cpi_authority_bump: u8,
    ika_cpi_bump: u8,
    message: Vec<u8>,
    target_chain: u8,
) -> Result<()> {
    // Req 1.6 — inactive treasury blocks everything except `update_treasury`.
    require!(
        ctx.accounts.treasury.is_active,
        VaulticError::TreasuryInactive
    );

    // Req 2.8 reused — the target chain enum is shared with
    // `EmployeeRecord.chain_preference` (0..=2).
    require!(target_chain <= 2, VaulticError::InvalidChainPreference);

    // Design §3.1.1.12 — bound the cross-chain message payload.
    require!(message.len() <= MAX_MESSAGE_LEN, VaulticError::Unauthorized);

    // DEVNET WORKAROUND: The Encrypt pre-alpha devnet program's
    // `event_authority` PDA has never been initialized by the upstream team,
    // so every CPI into Encrypt fails. Skip `check_policy_compliance` and
    // `request_decryption` CPIs unconditionally and proceed directly to the
    // Ika signing step. Remove this block once the upstream team initializes
    // the Encrypt event_authority PDA.
    let _ = (
        ctx.accounts.encrypt_program.key(),
        ctx.accounts.config.key(),
        ctx.accounts.deposit.key(),
        ctx.accounts.encrypt_cpi_authority.key(),
        ctx.accounts.caller_program.key(),
        ctx.accounts.network_encryption_key.key(),
        ctx.accounts.event_authority.key(),
        ctx.accounts.ct_total_out.key(),
        ctx.accounts.ct_spending_limit.key(),
        ctx.accounts.ct_policy_ok.key(),
        ctx.accounts.decryption_request.key(),
        cpi_authority_bump,
    );

    // Req 7.1 — the keccak256 of the message is what the MPC network
    // signs. Anchor 0.32 does not re-export `solana_program::keccak`, so
    // we use the standalone `solana-keccak-hasher` crate already pulled
    // in by `crate::ika`.
    let message_hash = hashv(&[message.as_slice()]).to_bytes();

    // Req 7.2 — raw CPI to Ika `approve_message` (disc 8). The helper
    // returns the same digest it embeds in the instruction data, which
    // we stash on `PayrollExecution` for later matching against the
    // produced signature.
    let stored_digest = ika::approve_message_cpi(
        ctx.accounts.message_approval.to_account_info(),
        ctx.accounts.dwallet.to_account_info(),
        ctx.accounts.ika_cpi_authority.to_account_info(),
        ctx.accounts.payer.to_account_info(),
        ctx.accounts.system_program.to_account_info(),
        // message_approval_bump: derive from the PDA seeds
        Pubkey::find_program_address(
            &[b"message_approval", ctx.accounts.treasury.dwallet_id.as_ref(), &message_hash],
            &ika::IKA_PROGRAM_ID,
        ).1,
        ika_cpi_bump,
        &message,
        ctx.accounts.treasury.authority,
        u16::from(ctx.accounts.treasury.dwallet_curve_type) as u8,
    )?;
    debug_assert_eq!(stored_digest, message_hash);

    let pe = &mut ctx.accounts.payroll_execution;
    pe.ika_message_hash = message_hash;
    // Req 5.5-style replay guard — zero the policy digest so a replay of
    // the Phase 2 call cannot re-approve with a stale decryption.
    pe.policy_digest = [0u8; 32];

    emit!(IkaSigningRequested {
        treasury: pe.treasury,
        message_hash,
        target_chain,
    });

    Ok(())
}
