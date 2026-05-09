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
use crate::fhe;
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
    /// CHECK: this program's executable account (shared between Encrypt
    /// and Ika — see `caller_program_enc` below, which reuses this).
    pub caller_program: UncheckedAccount<'info>,
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

    // Build the Encrypt CPI context once and reuse it across
    // `check_policy_compliance` (Phase 1) and `request_decryption`
    // (Phase 1 tail). `to_account_info` values are bound to `let`s so the
    // `&` references in the struct don't point at temporaries.
    let encrypt_program = ctx.accounts.encrypt_program.to_account_info();
    let config = ctx.accounts.config.to_account_info();
    let deposit = ctx.accounts.deposit.to_account_info();
    let encrypt_cpi_authority = ctx.accounts.encrypt_cpi_authority.to_account_info();
    let caller_program = ctx.accounts.caller_program.to_account_info();
    let network_encryption_key = ctx.accounts.network_encryption_key.to_account_info();
    let payer = ctx.accounts.payer.to_account_info();
    let event_authority = ctx.accounts.event_authority.to_account_info();
    let system_program = ctx.accounts.system_program.to_account_info();
    let encrypt_ctx = crate::encrypt::EncryptContext {
        encrypt_program: &encrypt_program,
        config: &config,
        deposit: &deposit,
        cpi_authority: &encrypt_cpi_authority,
        caller_program: &caller_program,
        network_encryption_key: &network_encryption_key,
        payer: &payer,
        event_authority: &event_authority,
        system_program: &system_program,
        cpi_authority_bump,
    };

    // Phase discriminator. `policy_digest == [0; 32]` means the Bool has
    // not been queued for decryption yet (Phase 1); a non-zero digest
    // means the decryptor has work pending (Phase 2).
    if ctx.accounts.payroll_execution.policy_digest == [0u8; 32] {
        // ── Phase 1: FHE comparison + decryption request ──────────────
        //
        // 1. Invoke `check_policy_compliance` to produce an encrypted
        //    Bool in `ct_policy_ok` whose decryption equals
        //    `ct_total_out <= limit`. The spending limit is a plaintext
        //    `PUint64` baked into the FHE graph at macro-expansion time
        //    and does NOT cross the CPI boundary — only the amount
        //    ciphertext and the output Bool ciphertext do.
        fhe::check_policy_compliance_cpi(
            &encrypt_ctx,
            ctx.accounts.ct_total_out.to_account_info(),
            ctx.accounts.ct_policy_ok.to_account_info(),
        )
        .map_err(|_| VaulticError::FHEExecutionFailed)?;

        // 2. Queue the Bool for decryption and snapshot the digest the
        //    Encrypt runtime records at request time. `read_decrypted_
        //    verified` in Phase 2 re-reads this digest and fails with
        //    `DecryptionNotComplete` on any mismatch (Req 5.6).
        let ct_policy_ok_info = ctx.accounts.ct_policy_ok.to_account_info();
        let decryption_request_info = ctx.accounts.decryption_request.to_account_info();
        let digest =
            fhe::request_decryption_cpi(&encrypt_ctx, &ct_policy_ok_info, &decryption_request_info)
                .map_err(|_| VaulticError::FHEExecutionFailed)?;

        ctx.accounts.payroll_execution.policy_digest = digest;
        // Phase 1 ends here — the Ika CPI is deferred until the
        // decryptor commits and the admin re-invokes the instruction.
        return Ok(());
    }

    // ── Phase 2: verified decryption + Ika approve_message ────────────
    //
    // Read the decrypted Bool through the verified helper. Encoded as a
    // `u64` on the wire with `0 = false`, `1 = true` — matches the
    // `Bool` CPI return shape used by `read_decrypted_verified`.
    let policy_digest = ctx.accounts.payroll_execution.policy_digest;
    let req_info = ctx.accounts.decryption_request.to_account_info();
    let req_data = req_info.try_borrow_data()?;
    let decrypted: u64 = fhe::read_decrypted_verified_cpi(&req_data, policy_digest)
        .map_err(|_| VaulticError::DecryptionNotComplete)?;
    drop(req_data);

    // Req 8.9 — the sole gate on the Ika CPI. If the decrypted boolean
    // is `false`, the payroll total exceeded the plaintext spending
    // limit and we refuse to approve the signing request.
    require!(decrypted == 1, VaulticError::SpendingLimitExceeded);

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
        ctx.accounts.coordinator.to_account_info(),
        ctx.accounts.message_approval.to_account_info(),
        ctx.accounts.dwallet.to_account_info(),
        ctx.accounts.caller_program.to_account_info(),
        ctx.accounts.ika_cpi_authority.to_account_info(),
        ctx.accounts.payer.to_account_info(),
        ctx.accounts.system_program.to_account_info(),
        ika_cpi_bump,
        &message,
        [0u8; 32], // no metadata digest for payroll messages
        ctx.accounts.treasury.authority,
        // signature_scheme discriminant mirrors dwallet_curve_type.
        u16::from(ctx.accounts.treasury.dwallet_curve_type),
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
