//! Ika raw CPI helpers — Reqs 6, 7, 24.
//!
//! Because the `ika-dwallet-anchor` crate targets `anchor-lang = "1.0"` and
//! Encrypt requires `anchor-lang = "0.32"`, Cargo cannot resolve both. We
//! therefore call Ika via raw CPI (`invoke_signed` with a manually serialized
//! instruction buffer), which is framework-independent.
//!
//! `approve_message` (disc 8) payload layout per design §6.2:
//! ```text
//! offset size  field
//!    0     1   discriminator = 0x08
//!    1     1   cpi_authority_bump
//!    2    32   message_digest         (keccak256 of message)
//!   34    32   message_metadata_digest (zero if unused)
//!   66    32   user_pubkey
//!   98     2   signature_scheme (u16 LE)
//! total: 100 bytes
//! ```
//!
//! CPI authority PDA seeds: `[b"__ika_cpi_authority"]` derived from OUR program ID.
//!
//! Implementation: Task 6.1

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};
use solana_keccak_hasher::hashv;

use crate::errors::VaulticError;

pub const IKA_PROGRAM_ID: Pubkey = pubkey!("87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY");
pub const IKA_CPI_AUTHORITY_SEED: &[u8] = b"__ika_cpi_authority";

/// Build and dispatch the Ika `approve_message` instruction via raw CPI.
///
/// Serializes the 100-byte instruction data per design §6.2, then calls
/// `invoke_signed` with the CPI authority PDA seeds so Ika sees our program
/// as the signer of the approval. Returns the keccak256 digest of `message`
/// so the caller can persist it for later matching against the produced
/// signature (Req 7.2).
///
/// Accounts (must be passed in exactly this order — Ika enforces it):
/// 1. coordinator      (writable)
/// 2. message_approval (writable)
/// 3. dwallet          (readonly)
/// 4. caller_program   (readonly — this program's executable account)
/// 5. cpi_authority    (readonly, signer via PDA)
/// 6. payer            (writable, signer)
/// 7. system_program   (readonly)
pub fn approve_message_cpi<'info>(
    coordinator: AccountInfo<'info>,
    message_approval: AccountInfo<'info>,
    dwallet: AccountInfo<'info>,
    caller_program: AccountInfo<'info>,
    cpi_authority: AccountInfo<'info>,
    payer: AccountInfo<'info>,
    system_program: AccountInfo<'info>,
    cpi_authority_bump: u8,
    message: &[u8],
    message_metadata_digest: [u8; 32],
    user_pubkey: Pubkey,
    signature_scheme: u16,
) -> Result<[u8; 32]> {
    let digest = hashv(&[message]).to_bytes();

    let mut data = Vec::<u8>::with_capacity(100);
    data.push(8); // discriminator
    data.push(cpi_authority_bump);
    data.extend_from_slice(&digest);
    data.extend_from_slice(&message_metadata_digest);
    data.extend_from_slice(&user_pubkey.to_bytes());
    data.extend_from_slice(&signature_scheme.to_le_bytes());
    debug_assert_eq!(data.len(), 100);

    let ix = Instruction {
        program_id: IKA_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(coordinator.key(), false),
            AccountMeta::new(message_approval.key(), false),
            AccountMeta::new_readonly(dwallet.key(), false),
            AccountMeta::new_readonly(caller_program.key(), false),
            AccountMeta::new_readonly(cpi_authority.key(), true), // signs via PDA
            AccountMeta::new(payer.key(), true),
            AccountMeta::new_readonly(system_program.key(), false),
        ],
        data,
    };

    invoke_signed(
        &ix,
        &[
            coordinator,
            message_approval,
            dwallet,
            caller_program,
            cpi_authority,
            payer,
            system_program,
        ],
        &[&[IKA_CPI_AUTHORITY_SEED, &[cpi_authority_bump]]],
    )
    .map_err(|_| VaulticError::IkaSigningFailed)?;

    Ok(digest)
}
