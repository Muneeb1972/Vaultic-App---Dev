//! Instruction handler modules.
//!
//! Each file defines the `#[derive(Accounts)]` struct for one or more
//! instructions and the business logic. This file re-exports them so
//! `lib.rs` can reference them with a single `use instructions::*;`.

pub mod claim;
pub mod decryption;
pub mod dwallet;
pub mod employee;
pub mod payroll;
pub mod policy;
pub mod treasury;

pub use claim::*;
pub use decryption::*;
pub use dwallet::*;
pub use employee::*;
pub use payroll::*;
pub use policy::*;
pub use treasury::*;
