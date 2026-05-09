//! FHE DSL functions + CPI wrappers — Reqs 4 (4.5–4.8), 22, 27.3.
//!
//! Each `#[encrypt_fn]` compiles into two artifacts at build time:
//!
//!   1. A serialized FHE computation graph embedded in the program binary,
//!      referenced by the generated `*_cpi` trait method.
//!   2. A trait `<Name>Cpi: EncryptCpi` with a method matching the
//!      snake_case function name. Blanket impl on every `T: EncryptCpi`,
//!      so `crate::encrypt::EncryptContext` picks the methods up
//!      automatically once its `impl EncryptCpi` block is in scope.
//!
//! The five graph functions (design §3.1.3) and their behaviour:
//!
//!   - `compute_salary_in_band`     — saturating clamp
//!   - `compute_bonus_amount`       — threshold gate + bps multiplier
//!   - `compute_vested_amount`      — cliff + linear + cap
//!   - `compute_total_payout`       — salary + bonus + vested
//!   - `check_policy_compliance`    — amount ≤ limit → EBool
//!
//! ## Type names
//!
//! The design document uses the scalar markers `Uint64` / `Bool`; the real
//! DSL exports the `E`-prefixed aliases `EUint64` / `EBool`
//! (`Encrypted<Uint64>`, `Encrypted<Bool>`). Semantics are identical.
//! `PUint64` is a plaintext-in-ciphertext-domain marker — values are baked
//! into the graph at macro-expansion time and do NOT cross the CPI boundary.
//!
//! ## CPI wrapper surface
//!
//! Each free function below delegates to the macro-generated trait method
//! so instruction handlers can call e.g.
//! `fhe::compute_total_payout_cpi(&ctx, ct_salary, ct_bonus, ct_vested, ct_out)`
//! without importing the generated trait (which is module-local here —
//! the macro doesn't mark it `pub`).
//!
//! The `_cpi` functions accept `&EncryptContext` (by reference) so the
//! caller keeps ownership of the context struct across multiple graph
//! invocations in the same instruction (e.g. `approve_payroll_message`
//! runs `check_policy_compliance` then `request_decryption` back-to-back).
//!
//! Implementation: Tasks 5.1, 9.2, 9.4, 10.1, 11.2.

use encrypt_dsl::prelude::*;

// ── FHE graph definitions (design §3.1.3) ─────────────────────────────

#[encrypt_fn]
pub fn compute_salary_in_band(salary: EUint64, band_min: EUint64, band_max: EUint64) -> EUint64 {
    // saturating clamp: max(min(salary, band_max), band_min)
    let capped = salary.min(band_max);
    capped.max(band_min)
}

#[encrypt_fn]
pub fn compute_bonus_amount(
    base_salary: EUint64,
    performance_score: EUint64,
    threshold: EUint64,
    bonus_multiplier_bps: PUint64, // plaintext multiplier (mirrors PayrollConfig.bonus_multiplier_bps: u16)
) -> EUint64 {
    // if performance > threshold then base * bps / 10_000 else 0
    let bonus = (base_salary * bonus_multiplier_bps) / PUint64::from(10_000u64);
    let gate = performance_score.is_greater_than(threshold);
    gate.select(bonus, EUint64::from(0u64))
}

#[encrypt_fn]
pub fn compute_vested_amount(
    total_allocation: EUint64,
    elapsed_time: EUint64,
    cliff: EUint64,
    duration: EUint64,
) -> EUint64 {
    let linear = (total_allocation * elapsed_time) / duration;
    let capped = linear.min(total_allocation);
    let before_cliff = elapsed_time.is_less_than(cliff);
    before_cliff.select(EUint64::from(0u64), capped)
}

#[encrypt_fn]
pub fn compute_total_payout(salary: EUint64, bonus: EUint64, vested: EUint64) -> EUint64 {
    salary + bonus + vested
}

#[encrypt_fn]
pub fn check_policy_compliance(
    amount: EUint64, // encrypted payroll total
    limit: PUint64,  // plaintext spending limit
) -> EBool {
    // Comparison returns an `EUint64` 0/1; project into the `EBool` slot.
    let cmp = amount.is_less_or_equal(limit);
    cmp.to_boolean()
}

// ── CPI wrapper helpers ──────────────────────────────────────────────
//
// Free-function wrappers over the macro-generated `*Cpi` traits. Callers
// pass `&crate::encrypt::EncryptContext` plus the raw ciphertext accounts;
// the wrapper dispatches to the trait method and converts the returned
// `ProgramError` into Anchor's `Error` via the standard `From` impl.

use crate::encrypt::EncryptContext;
use anchor_lang::prelude::*;

/// Invoke the `compute_total_payout` FHE graph via CPI (design §3.1.1.7).
///
/// Inputs (order mirrors the `#[encrypt_fn]` signature):
///   - `ct_salary`, `ct_bonus`, `ct_vested` — encrypted `EUint64` inputs
///   - `ct_output` — the ciphertext account the FHE executor will commit
///     the result to (asynchronously — `finalize_payroll` gates on the
///     commit signal via `crate::encrypt::is_committed`).
pub fn compute_total_payout_cpi<'info>(
    ctx: &EncryptContext<'_, 'info>,
    ct_salary: AccountInfo<'info>,
    ct_bonus: AccountInfo<'info>,
    ct_vested: AccountInfo<'info>,
    ct_output: AccountInfo<'info>,
) -> Result<()> {
    ctx.compute_total_payout(ct_salary, ct_bonus, ct_vested, ct_output)
        .map_err(Into::into)
}

/// Invoke the `compute_bonus_amount` FHE graph via CPI (design §3.1.1.9).
///
/// The `bonus_multiplier_bps: PUint64` argument is folded into the graph
/// at macro-expansion time — it does NOT cross the CPI boundary. Only
/// the three encrypted inputs and the output account are forwarded.
pub fn compute_bonus_amount_cpi<'info>(
    ctx: &EncryptContext<'_, 'info>,
    ct_base_salary: AccountInfo<'info>,
    ct_performance: AccountInfo<'info>,
    ct_threshold: AccountInfo<'info>,
    ct_output: AccountInfo<'info>,
) -> Result<()> {
    ctx.compute_bonus_amount(ct_base_salary, ct_performance, ct_threshold, ct_output)
        .map_err(Into::into)
}

/// Invoke the `check_policy_compliance` FHE graph via CPI (design §3.1.1.12).
///
/// The `limit: PUint64` argument is plaintext — folded into the graph at
/// macro-expansion time, NOT passed at CPI time. Only `ct_amount` and
/// `ct_output` cross the boundary. The output boolean ciphertext must
/// still round-trip through `request_decryption` /
/// `read_decrypted_verified` (Req 5.4) to read the comparison result.
pub fn check_policy_compliance_cpi<'info>(
    ctx: &EncryptContext<'_, 'info>,
    ct_amount: AccountInfo<'info>,
    ct_output: AccountInfo<'info>,
) -> Result<()> {
    ctx.check_policy_compliance(ct_amount, ct_output)
        .map_err(Into::into)
}

/// Request decryption of a ciphertext (Reqs 5.1, 8.9 decrypt phase).
///
/// Delegates to `EncryptContext::request_decryption`. Returns the
/// 32-byte `ciphertext_digest` snapshot the Encrypt runtime records at
/// request time — store this in your program state so
/// `read_decrypted_verified` can later confirm the returned plaintext
/// corresponds to the same ciphertext (Reqs 5.2, 5.6 stale-value guard).
pub fn request_decryption_cpi<'info>(
    ctx: &EncryptContext<'_, 'info>,
    ct: &AccountInfo<'info>,
    decryption_request: &AccountInfo<'info>,
) -> Result<[u8; 32]> {
    ctx.request_decryption(decryption_request, ct)
        .map_err(Into::into)
}

/// Read a verified decrypted `u64` out of a `DecryptionRequest` account.
///
/// Thin wrapper over `crate::encrypt::read_decrypted_verified::<Uint64>`.
/// Callers `try_borrow_data()` on the request account first (see
/// `instructions/decryption.rs` for the canonical pattern).
///
/// Returns an error when either the request is not yet fully written
/// (Req 5.7) or the stored digest disagrees with `expected_digest`
/// (Req 5.6 stale-value guard). Callers map the error to
/// `VaulticError::DecryptionNotComplete`.
pub fn read_decrypted_verified_cpi(req_data: &[u8], expected_digest: [u8; 32]) -> Result<u64> {
    let value = crate::encrypt::read_decrypted_verified::<encrypt_types::encrypted::Uint64>(
        req_data,
        &expected_digest,
    )
    .ok_or_else(|| {
        anchor_lang::error::Error::from(
            anchor_lang::solana_program::program_error::ProgramError::InvalidArgument,
        )
    })?;
    Ok(*value)
}
