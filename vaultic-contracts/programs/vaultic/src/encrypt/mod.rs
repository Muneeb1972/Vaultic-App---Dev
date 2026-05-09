//! Encrypt CPI bridge — Reqs 4.4, 5.1, 5.3, 8.9, 24.1.
//!
//! Hand-rolled `EncryptContext` that implements
//! `encrypt_solana_types::cpi::EncryptCpi` against **anchor-lang 0.32's**
//! `AccountInfo<'info>`. The `#[encrypt_fn]`-generated per-graph traits
//! (`ComputeTotalPayoutCpi`, etc.) blanket-impl for every `T: EncryptCpi`,
//! so once this impl lands the generated method call sites in
//! `crate::fhe` light up without any further glue.
//!
//! ## Why not depend on `encrypt-native` or `encrypt-anchor`?
//!
//! Both upstream SDKs drag transitive `solana-program` versions (v3+ for
//! native, v4 for anchor) that carry their own `AccountInfo` and
//! `ProgramError` types. Rust treats different crate versions of the same
//! type as incompatible, so passing our `anchor_lang::prelude::AccountInfo`
//! across a boundary typed for the upstream version fails to compile.
//!
//! This module side-steps the problem by implementing `EncryptCpi`
//! ourselves — every account and every error flows through the single
//! `solana-program v2.x` tree that anchor-lang 0.32 pulls in.
//!
//! The implementation mirrors `encrypt-native`'s `cpi.rs` (instruction
//! byte layouts + account orderings are stable across upstream crate
//! versions — only the Rust types differ). Any divergence from the
//! upstream byte layout is a real on-chain protocol change and will be
//! caught by integration tests.
//!
//! Implementation: Task 7.1 (post-Phase-1 blocker resolution).

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke_signed;

use encrypt_solana_types::cpi::EncryptCpi;

pub mod cpi_accounts;
pub use cpi_accounts::{EncryptContextOwned, HasEncryptCpiAccounts};

// ── Constants ─────────────────────────────────────────────────────────

/// Devnet program id for the Encrypt (FHE) program.
pub const ENCRYPT_PROGRAM_ID: Pubkey = pubkey!("4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8");

/// PDA seed for this program's Encrypt CPI authority. The authority is
/// derived from OUR program id (not Encrypt's):
/// `find_program_address(&[ENCRYPT_CPI_AUTHORITY_SEED], &crate::ID)`.
///
/// Matches the `CPI_AUTHORITY_SEED` in `encrypt-native/cpi.rs` verbatim.
pub const ENCRYPT_CPI_AUTHORITY_SEED: &[u8] = b"__encrypt_cpi_authority";

/// Instruction discriminator for `create_plaintext_ciphertext` — matches upstream.
///
/// Source: `chains/solana/dev/src/tx_builder.rs::disc::CREATE_PLAINTEXT_CIPHERTEXT`
/// in the `dwallet-labs/encrypt-pre-alpha` repository.
///
/// Byte layout: `[disc=2, fhe_type(1), plaintext_LE(byte_width)]`
/// For `Uint64`: `[2, Uint64::FHE_TYPE_ID, value.to_le_bytes()]` = 10 bytes total.
const IX_CREATE_PLAINTEXT_CIPHERTEXT: u8 = 2;

/// Instruction discriminator for `request_decryption` — matches upstream.
const IX_REQUEST_DECRYPTION: u8 = 11;

// ── Type re-exports ───────────────────────────────────────────────────

/// Encrypted scalar markers used inside `#[encrypt_fn]` graph bodies.
pub use encrypt_types::encrypted::{EBool, EUint64};

/// Plaintext scalar markers used by `read_decrypted_verified::<T>` to
/// decode raw `DecryptionRequest` bytes into typed `T::DecryptedValue`s
/// (`u64` for `Uint64`, `bool` for `Bool`).
pub use encrypt_types::encrypted::{Bool, Uint64};

// ── EncryptContext ────────────────────────────────────────────────────

/// CPI context for Encrypt program invocations.
///
/// Populate via struct literal in each instruction handler — see
/// `instructions/payroll.rs` for the canonical pattern. The 10 accounts
/// match the Encrypt program's expected account order (design §3.1.1.7,
/// mirrored from `encrypt-native/cpi.rs::EncryptContext`).
pub struct EncryptContext<'a, 'info> {
    pub encrypt_program: &'a AccountInfo<'info>,
    pub config: &'a AccountInfo<'info>,
    pub deposit: &'a AccountInfo<'info>,
    pub cpi_authority: &'a AccountInfo<'info>,
    pub caller_program: &'a AccountInfo<'info>,
    pub network_encryption_key: &'a AccountInfo<'info>,
    pub payer: &'a AccountInfo<'info>,
    pub event_authority: &'a AccountInfo<'info>,
    pub system_program: &'a AccountInfo<'info>,
    pub cpi_authority_bump: u8,
}

impl<'a, 'info> EncryptCpi for EncryptContext<'a, 'info> {
    type Error = anchor_lang::solana_program::program_error::ProgramError;
    type Account<'b>
        = AccountInfo<'info>
    where
        Self: 'b;

    fn read_fhe_type<'b>(&'b self, account: AccountInfo<'info>) -> Option<u8> {
        let data = account.try_borrow_data().ok()?;
        if data.len() < encrypt_solana_types::accounts::CT_LEN {
            return None;
        }
        Some(data[encrypt_solana_types::accounts::CT_FHE_TYPE])
    }

    fn type_mismatch_error(&self) -> Self::Error {
        anchor_lang::solana_program::program_error::ProgramError::InvalidArgument
    }

    fn invoke_execute_graph<'b>(
        &'b self,
        ix_data: &[u8],
        encrypt_execute_accounts: &[AccountInfo<'info>],
    ) -> core::result::Result<(), Self::Error> {
        // Fixed 8-account context prefix per `encrypt-native/cpi.rs`.
        let mut accounts = vec![
            AccountMeta::new(*self.config.key, false),
            AccountMeta::new(*self.deposit.key, false),
            AccountMeta::new_readonly(*self.caller_program.key, false),
            AccountMeta::new_readonly(*self.cpi_authority.key, true),
            AccountMeta::new_readonly(*self.network_encryption_key.key, false),
            AccountMeta::new(*self.payer.key, true),
            AccountMeta::new_readonly(*self.event_authority.key, false),
            AccountMeta::new_readonly(*self.encrypt_program.key, false),
        ];
        for acct in encrypt_execute_accounts {
            accounts.push(AccountMeta::new(*acct.key, false));
        }

        let ix = Instruction {
            program_id: *self.encrypt_program.key,
            accounts,
            data: ix_data.to_vec(),
        };

        let mut account_infos = vec![
            self.config.clone(),
            self.deposit.clone(),
            self.caller_program.clone(),
            self.cpi_authority.clone(),
            self.network_encryption_key.clone(),
            self.payer.clone(),
            self.event_authority.clone(),
            self.encrypt_program.clone(),
        ];
        account_infos.extend_from_slice(encrypt_execute_accounts);

        let seeds = &[ENCRYPT_CPI_AUTHORITY_SEED, &[self.cpi_authority_bump]];
        let signer_seeds = &[&seeds[..]];
        invoke_signed(&ix, &account_infos, signer_seeds)
    }
}

impl<'a, 'info> EncryptContext<'a, 'info> {
    /// Create a ciphertext from a plaintext `u64` value (encrypt-integration Req 5).
    ///
    /// Issues a CPI to the Encrypt program's `create_plaintext_ciphertext` instruction
    /// (discriminator `2`). The Encrypt_Executor will asynchronously write the
    /// 17-byte mock ciphertext `[fhe_type || value_LE]` into the `ciphertext` account.
    ///
    /// ## Byte layout
    /// `[disc=2, Uint64::FHE_TYPE_ID, value.to_le_bytes()]` — 10 bytes total.
    ///
    /// ## Account order (10 accounts, pinned from upstream `program-sdk/native/src/cpi.rs`)
    /// 1. config          — read-only, non-signer
    /// 2. deposit         — writable, non-signer
    /// 3. ciphertext      — writable, signer (the Fresh_Ciphertext_Keypair)
    /// 4. caller_program  — read-only, non-signer
    /// 5. cpi_authority   — read-only, signer (via `invoke_signed` seeds)
    /// 6. network_encryption_key — read-only, non-signer
    /// 7. payer           — writable, signer
    /// 8. system_program  — read-only, non-signer
    /// 9. event_authority — read-only, non-signer
    /// 10. encrypt_program — read-only, non-signer
    ///
    /// ## Source
    /// `chains/solana/program-sdk/native/src/cpi.rs::create_plaintext` in
    /// `dwallet-labs/encrypt-pre-alpha`. Mirrors the upstream byte layout byte-for-byte.
    ///
    /// ## Atomicity (Req 4.7)
    /// If this CPI fails, the caller MUST map the error to
    /// `VaulticError::CtAccountCreationFailed` and return immediately so that
    /// no partial state is persisted to the calling PDA.
    pub fn create_plaintext_u64(
        &self,
        value: u64,
        ciphertext: &'a AccountInfo<'info>,
    ) -> core::result::Result<(), anchor_lang::solana_program::program_error::ProgramError> {
        // Byte layout: [disc=2, fhe_type, plaintext_LE(8)] = 10 bytes.
        // Using `u64::to_le_bytes()` is value-identical to the upstream unsafe
        // raw-pointer cast over `T::DecryptedValue` for `Uint64` on a LE target
        // (Solana BPF is little-endian), but is safe and explicit.
        let fhe_type_id =
            <encrypt_types::encrypted::Uint64 as encrypt_types::encrypted::EncryptedType>::FHE_TYPE_ID;
        let mut ix_data = Vec::with_capacity(10);
        ix_data.push(IX_CREATE_PLAINTEXT_CIPHERTEXT);
        ix_data.push(fhe_type_id);
        ix_data.extend_from_slice(&value.to_le_bytes());

        let accounts = vec![
            AccountMeta::new_readonly(*self.config.key, false),
            AccountMeta::new(*self.deposit.key, false),
            AccountMeta::new(*ciphertext.key, true),
            AccountMeta::new_readonly(*self.caller_program.key, false),
            AccountMeta::new_readonly(*self.cpi_authority.key, true),
            AccountMeta::new_readonly(*self.network_encryption_key.key, false),
            AccountMeta::new(*self.payer.key, true),
            AccountMeta::new_readonly(*self.system_program.key, false),
            AccountMeta::new_readonly(*self.event_authority.key, false),
            AccountMeta::new_readonly(*self.encrypt_program.key, false),
        ];

        let ix = Instruction {
            program_id: *self.encrypt_program.key,
            accounts,
            data: ix_data,
        };

        let account_infos = [
            self.config.clone(),
            self.deposit.clone(),
            ciphertext.clone(),
            self.caller_program.clone(),
            self.cpi_authority.clone(),
            self.network_encryption_key.clone(),
            self.payer.clone(),
            self.system_program.clone(),
            self.event_authority.clone(),
            self.encrypt_program.clone(),
        ];

        let seeds = &[ENCRYPT_CPI_AUTHORITY_SEED, &[self.cpi_authority_bump]];
        let signer_seeds = &[&seeds[..]];
        invoke_signed(&ix, &account_infos, signer_seeds)
    }

    /// Request decryption of a ciphertext (Reqs 5.1, 8.9 decrypt phase).
    ///
    /// Reads the `ciphertext_digest` from the ciphertext account's raw
    /// bytes BEFORE the CPI so the returned digest is a snapshot captured
    /// at request time (the Encrypt program overwrites the ciphertext
    /// account during processing in some cases; the snapshot lets
    /// `read_decrypted_verified` detect stale values — Req 5.6).
    ///
    /// Mirrors `encrypt-native/cpi.rs::EncryptContext::request_decryption`
    /// byte-for-byte (same ix discriminator, same account order).
    pub fn request_decryption(
        &self,
        request_acct: &'a AccountInfo<'info>,
        ciphertext: &'a AccountInfo<'info>,
    ) -> core::result::Result<[u8; 32], anchor_lang::solana_program::program_error::ProgramError>
    {
        let digest = {
            let ct_data = ciphertext.try_borrow_data().map_err(|_| {
                anchor_lang::solana_program::program_error::ProgramError::InvalidAccountData
            })?;
            *encrypt_solana_types::accounts::parse_ciphertext_digest(&ct_data).ok_or(
                anchor_lang::solana_program::program_error::ProgramError::InvalidAccountData,
            )?
        };

        let ix_data = [IX_REQUEST_DECRYPTION];
        let accounts = vec![
            AccountMeta::new_readonly(*self.config.key, false),
            AccountMeta::new(*self.deposit.key, false),
            AccountMeta::new(*request_acct.key, true),
            AccountMeta::new_readonly(*self.caller_program.key, false),
            AccountMeta::new_readonly(*self.cpi_authority.key, true),
            AccountMeta::new_readonly(*ciphertext.key, false),
            AccountMeta::new(*self.payer.key, true),
            AccountMeta::new_readonly(*self.system_program.key, false),
            AccountMeta::new_readonly(*self.event_authority.key, false),
            AccountMeta::new_readonly(*self.encrypt_program.key, false),
        ];
        let ix = Instruction {
            program_id: *self.encrypt_program.key,
            accounts,
            data: ix_data.to_vec(),
        };
        let account_infos = [
            self.config.clone(),
            self.deposit.clone(),
            request_acct.clone(),
            self.caller_program.clone(),
            self.cpi_authority.clone(),
            ciphertext.clone(),
            self.payer.clone(),
            self.system_program.clone(),
            self.event_authority.clone(),
            self.encrypt_program.clone(),
        ];
        let seeds = &[ENCRYPT_CPI_AUTHORITY_SEED, &[self.cpi_authority_bump]];
        let signer_seeds = &[&seeds[..]];
        invoke_signed(&ix, &account_infos, signer_seeds)?;
        Ok(digest)
    }
}

// ── Typed decryption reader ───────────────────────────────────────────

/// Read a verified decrypted value from a `DecryptionRequest` account.
///
/// `request_data` is the borrowed raw bytes (`try_borrow_data()` on the
/// `DecryptionRequest` `AccountInfo`). `expected_digest` is the
/// `ciphertext_digest` snapshot stored by your program at
/// `request_decryption` time (Reqs 5.2, 5.6).
///
/// Returns `None` when either the request is not yet fully written
/// (Req 5.7) or the stored digest disagrees with `expected_digest`
/// (Req 5.6 stale-value protection). Callers map to
/// `VaulticError::DecryptionNotComplete`.
///
/// Thin wrapper over `encrypt_solana_types::accounts::parse_decrypted_verified`.
pub fn read_decrypted_verified<'a, T: encrypt_types::encrypted::EncryptedType>(
    request_data: &'a [u8],
    expected_digest: &[u8; 32],
) -> Option<&'a T::DecryptedValue> {
    encrypt_solana_types::accounts::parse_decrypted_verified::<T>(request_data, expected_digest)
}

// ── Local helpers ─────────────────────────────────────────────────────

/// Status discriminant meaning "FHE executor has committed the output
/// ciphertext". Matches `encrypt_solana_types::accounts::parse_ciphertext_status`:
/// `0 = Pending, 1 = Verified`.
const CT_STATUS_COMMITTED: u8 = 1;

/// Return `true` iff the ciphertext account has been committed by the FHE
/// executor.
///
/// Used by `finalize_payroll` (design §3.1.1.8) to gate the
/// `Processing → Completed` state transition on the asynchronous commit
/// event (Req 4.9).
///
/// Returns `Ok(false)` when the account data is shorter than the expected
/// ciphertext layout — treated as "not committed yet" for the purposes
/// of the finalize guard. Returns `Err` only on borrow failure.
pub fn is_committed(ct: &AccountInfo) -> Result<bool> {
    let data = ct.try_borrow_data()?;
    match encrypt_solana_types::accounts::parse_ciphertext_status(&data) {
        Some(status) => Ok(status == CT_STATUS_COMMITTED),
        None => Ok(false),
    }
}
