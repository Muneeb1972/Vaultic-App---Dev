//! `HasEncryptCpiAccounts` trait — shared helper for building an `EncryptContext`
//! from any Anchor `#[derive(Accounts)]` struct that carries the nine Encrypt
//! CPI account fields.
//!
//! ## Why a trait?
//!
//! Three instruction handlers (`register_employee`, `set_payroll_config`, and
//! potentially future handlers) each carry the same nine Encrypt CPI accounts
//! as explicit `#[derive(Accounts)]` fields. Without this trait, each handler
//! would repeat the same nine `to_account_info()` calls and the same
//! `EncryptContext { ... }` struct literal — ~20 lines of boilerplate per
//! handler.
//!
//! The trait provides a single `build_encrypt_context` method that any struct
//! implementing it can call to get a ready-to-use `EncryptContext<'_, '_>`.
//!
//! ## Usage
//!
//! ```rust,ignore
//! // In an instruction handler:
//! let encrypt_ctx = ctx.accounts.build_encrypt_context(cpi_authority_bump);
//! encrypt_ctx.create_plaintext_u64(salary_plaintext, &ctx.accounts.ct_salary.to_account_info())
//!     .map_err(|_| VaulticError::CtAccountCreationFailed)?;
//! ```
//!
//! ## Implementation note
//!
//! The trait is sealed (no external implementors) via the private `Sealed`
//! supertrait pattern. Only the two instruction account structs in this crate
//! implement it.

use anchor_lang::prelude::*;

use super::EncryptContext;

/// Sealed marker — prevents external crates from implementing
/// `HasEncryptCpiAccounts`.
mod private {
    pub trait Sealed {}
}

/// Implemented by any `#[derive(Accounts)]` struct that carries the nine
/// Encrypt CPI account fields in the order required by `EncryptContext`.
///
/// The nine fields are:
/// `encrypt_program`, `config`, `deposit`, `cpi_authority`,
/// `caller_program`, `network_encryption_key`, `payer`,
/// `event_authority`, `system_program`.
pub trait HasEncryptCpiAccounts<'info>: private::Sealed {
    fn encrypt_program(&self) -> AccountInfo<'info>;
    fn config(&self) -> AccountInfo<'info>;
    fn deposit(&self) -> AccountInfo<'info>;
    fn cpi_authority(&self) -> AccountInfo<'info>;
    fn caller_program(&self) -> AccountInfo<'info>;
    fn network_encryption_key(&self) -> AccountInfo<'info>;
    fn payer(&self) -> AccountInfo<'info>;
    fn event_authority(&self) -> AccountInfo<'info>;
    fn system_program(&self) -> AccountInfo<'info>;

    /// Build an `EncryptContext` from the nine CPI accounts.
    ///
    /// The returned context borrows from the `AccountInfo` values returned by
    /// the accessor methods above. Callers must ensure the `AccountInfo`
    /// temporaries live long enough — in practice, bind them to `let`
    /// variables before calling this method if the borrow checker complains.
    ///
    /// `cpi_authority_bump` is the bump for the `[b"__encrypt_cpi_authority"]`
    /// PDA of the Vaultic program, passed as an instruction argument.
    fn build_encrypt_context<'a>(
        &'a self,
        cpi_authority_bump: u8,
    ) -> EncryptContextOwned<'a, 'info>
    where
        'info: 'a,
    {
        EncryptContextOwned {
            encrypt_program: self.encrypt_program(),
            config: self.config(),
            deposit: self.deposit(),
            cpi_authority: self.cpi_authority(),
            caller_program: self.caller_program(),
            network_encryption_key: self.network_encryption_key(),
            payer: self.payer(),
            event_authority: self.event_authority(),
            system_program: self.system_program(),
            cpi_authority_bump,
            _lifetime: core::marker::PhantomData,
        }
    }
}

/// Owned `AccountInfo` values for building an `EncryptContext`.
///
/// This intermediate struct holds the nine `AccountInfo<'info>` values by
/// value so that `EncryptContext<'a, 'info>` can borrow from them with a
/// lifetime `'a` tied to this struct's lifetime.
pub struct EncryptContextOwned<'a, 'info> {
    pub encrypt_program: AccountInfo<'info>,
    pub config: AccountInfo<'info>,
    pub deposit: AccountInfo<'info>,
    pub cpi_authority: AccountInfo<'info>,
    pub caller_program: AccountInfo<'info>,
    pub network_encryption_key: AccountInfo<'info>,
    pub payer: AccountInfo<'info>,
    pub event_authority: AccountInfo<'info>,
    pub system_program: AccountInfo<'info>,
    pub cpi_authority_bump: u8,
    #[allow(dead_code)]
    _lifetime: core::marker::PhantomData<&'a ()>,
}

impl<'a, 'info> EncryptContextOwned<'a, 'info>
where
    'info: 'a,
{
    /// Borrow the owned `AccountInfo` values into an `EncryptContext<'a, 'info>`.
    pub fn as_context(&'a self) -> EncryptContext<'a, 'info> {
        EncryptContext {
            encrypt_program: &self.encrypt_program,
            config: &self.config,
            deposit: &self.deposit,
            cpi_authority: &self.cpi_authority,
            caller_program: &self.caller_program,
            network_encryption_key: &self.network_encryption_key,
            payer: &self.payer,
            event_authority: &self.event_authority,
            system_program: &self.system_program,
            cpi_authority_bump: self.cpi_authority_bump,
        }
    }
}

impl<'a, 'info> EncryptContextOwned<'a, 'info>
where
    'info: 'a,
{
    fn new(
        encrypt_program: AccountInfo<'info>,
        config: AccountInfo<'info>,
        deposit: AccountInfo<'info>,
        cpi_authority: AccountInfo<'info>,
        caller_program: AccountInfo<'info>,
        network_encryption_key: AccountInfo<'info>,
        payer: AccountInfo<'info>,
        event_authority: AccountInfo<'info>,
        system_program: AccountInfo<'info>,
        cpi_authority_bump: u8,
    ) -> Self {
        Self {
            encrypt_program,
            config,
            deposit,
            cpi_authority,
            caller_program,
            network_encryption_key,
            payer,
            event_authority,
            system_program,
            cpi_authority_bump,
            _lifetime: core::marker::PhantomData,
        }
    }
}
