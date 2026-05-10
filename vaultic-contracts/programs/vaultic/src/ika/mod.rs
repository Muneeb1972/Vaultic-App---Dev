//! Ika raw CPI helpers — Reqs 6, 7, 24.
//!
//! Because the `ika-dwallet-anchor` crate targets `anchor-lang = "1.0"` and
//! Encrypt requires `anchor-lang = "0.32"`, Cargo cannot resolve both. We
//! therefore call Ika via raw CPI (`invoke_signed` with a manually serialized
//! instruction buffer), which is framework-independent.
//!
//! ## Corrected `approve_message` layout
//!
//! Source: https://solana-pre-alpha.ika.xyz/frameworks/typescript
//!
//! Instruction data (67 bytes):
//! ```text
//! offset  size  field
//!    0      1   discriminator = 0x08
//!    1      1   message_approval_bump
//!    2     32   message_hash  (keccak256 of message)
//!   34     32   user_pubkey
//!   66      1   signature_scheme  (0=Ed25519, 1=Secp256k1, etc.)
//! total: 67 bytes
//! ```
//!
//! Accounts (5, in this exact order):
//!   1. message_approval  (writable, PDA)
//!   2. dwallet           (readonly)
//!   3. authority         (readonly, signer — the CPI authority PDA)
//!   4. payer             (writable, signer)
//!   5. system_program    (readonly)
//!
//! MessageApproval PDA seeds: `["message_approval", dwallet_pubkey, message_hash]`
//! under the Ika program.
//!
//! ## `MessageApproval` account read layout
//!
//! Source: https://solana-pre-alpha.ika.xyz/frameworks/typescript
//!
//! ```text
//! offset  size  field
//!    0      2   disc + version prefix
//!    2     32   dwallet pubkey
//!   34     32   message_hash
//!   66     32   approver pubkey
//!  139      1   status  (0=Pending, 1=Signed)
//!  140      2   signature_len (u16 LE)
//!  142    var   signature bytes
//! ```

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};
use solana_keccak_hasher::hashv;

use crate::errors::VaulticError;

pub const IKA_PROGRAM_ID: Pubkey = pubkey!("87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY");
pub const IKA_CPI_AUTHORITY_SEED: &[u8] = b"__ika_cpi_authority";

/// Byte offset of the `status` field in a `MessageApproval` account.
pub const MESSAGE_APPROVAL_STATUS_OFFSET: usize = 139;
/// Byte offset of the `signature_len` u16 in a `MessageApproval` account.
pub const MESSAGE_APPROVAL_SIG_LEN_OFFSET: usize = 140;
/// Byte offset where signature bytes begin in a `MessageApproval` account.
pub const MESSAGE_APPROVAL_SIG_OFFSET: usize = 142;
/// Status value meaning the Ika network has produced a signature.
pub const MESSAGE_APPROVAL_STATUS_SIGNED: u8 = 1;
/// Maximum expected signature length (96 bytes for Secp256k1 + recovery byte).
pub const MAX_SIGNATURE_LEN: usize = 96;

/// Build and dispatch the Ika `approve_message` instruction via raw CPI.
///
/// Uses the corrected 67-byte instruction layout and 5-account list from
/// the official Ika pre-alpha TypeScript docs.
///
/// Returns the keccak256 digest of `message` so the caller can persist it
/// for later matching when reading the `MessageApproval` account (Req 7.2).
///
/// ## Account order (5 accounts — Ika enforces this exactly)
/// 1. message_approval  — writable, PDA derived from `["message_approval", dwallet, message_hash]`
/// 2. dwallet           — readonly
/// 3. cpi_authority     — readonly, signer (our PDA via `invoke_signed`)
/// 4. payer             — writable, signer
/// 5. system_program    — readonly
pub fn approve_message_cpi<'info>(
    message_approval: AccountInfo<'info>,
    dwallet: AccountInfo<'info>,
    cpi_authority: AccountInfo<'info>,
    payer: AccountInfo<'info>,
    system_program: AccountInfo<'info>,
    message_approval_bump: u8,
    cpi_authority_bump: u8,
    message: &[u8],
    user_pubkey: Pubkey,
    signature_scheme: u8,
) -> Result<[u8; 32]> {
    let message_hash = hashv(&[message]).to_bytes();

    // 67-byte instruction data per upstream docs.
    let mut data = Vec::<u8>::with_capacity(67);
    data.push(8);                                       // discriminator
    data.push(message_approval_bump);                   // PDA bump
    data.extend_from_slice(&message_hash);              // [u8; 32]
    data.extend_from_slice(&user_pubkey.to_bytes());    // [u8; 32]
    data.push(signature_scheme);                        // u8
    debug_assert_eq!(data.len(), 67);

    let ix = Instruction {
        program_id: IKA_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(message_approval.key(), false),
            AccountMeta::new_readonly(dwallet.key(), false),
            AccountMeta::new_readonly(cpi_authority.key(), true), // signs via PDA
            AccountMeta::new(payer.key(), true),
            AccountMeta::new_readonly(system_program.key(), false),
        ],
        data,
    };

    invoke_signed(
        &ix,
        &[
            message_approval,
            dwallet,
            cpi_authority,
            payer,
            system_program,
        ],
        &[&[IKA_CPI_AUTHORITY_SEED, &[cpi_authority_bump]]],
    )
    .map_err(|_| VaulticError::IkaSigningFailed)?;

    Ok(message_hash)
}

/// Read the signature from a `MessageApproval` account after Ika has signed.
///
/// Returns `Ok(signature_bytes)` when `status == 1` (Signed).
/// Returns `Err(VaulticError::IkaSigningPending)` when `status == 0` (Pending).
/// Returns `Err(VaulticError::IkaSigningFailed)` on malformed account data.
///
/// ## Layout (from upstream docs)
/// - offset 139: status u8 (0=Pending, 1=Signed)
/// - offset 140: signature_len u16 LE
/// - offset 142: signature bytes
pub fn read_message_approval_signature(data: &[u8]) -> Result<Vec<u8>> {
    if data.len() <= MESSAGE_APPROVAL_STATUS_OFFSET {
        return Err(VaulticError::IkaSigningFailed.into());
    }

    let status = data[MESSAGE_APPROVAL_STATUS_OFFSET];
    if status != MESSAGE_APPROVAL_STATUS_SIGNED {
        return Err(VaulticError::IkaSigningPending.into());
    }

    if data.len() < MESSAGE_APPROVAL_SIG_LEN_OFFSET + 2 {
        return Err(VaulticError::IkaSigningFailed.into());
    }

    let sig_len = u16::from_le_bytes([
        data[MESSAGE_APPROVAL_SIG_LEN_OFFSET],
        data[MESSAGE_APPROVAL_SIG_LEN_OFFSET + 1],
    ]) as usize;

    if sig_len == 0 || sig_len > MAX_SIGNATURE_LEN {
        return Err(VaulticError::IkaSigningFailed.into());
    }

    let end = MESSAGE_APPROVAL_SIG_OFFSET + sig_len;
    if data.len() < end {
        return Err(VaulticError::IkaSigningFailed.into());
    }

    Ok(data[MESSAGE_APPROVAL_SIG_OFFSET..end].to_vec())
}
