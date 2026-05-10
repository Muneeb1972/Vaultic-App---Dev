//! Pure-Rust simulators mirroring the FHE #[encrypt_fn] graphs in
//! programs/vaultic/src/fhe/mod.rs. Proptests use these to validate invariants
//! (Req 22) without invoking the live Encrypt program.

/// P3 — saturating clamp: max(min(s, hi), lo). Caller must ensure `lo <= hi`.
pub fn compute_salary_in_band_sim(salary: u64, band_min: u64, band_max: u64) -> u64 {
    salary.min(band_max).max(band_min)
}

/// P4 — threshold gate: (base * bps) / 10_000 when perf > threshold else 0.
/// Uses saturating_mul to mirror FHE overflow semantics.
pub fn compute_bonus_amount_sim(
    base_salary: u64,
    performance_score: u64,
    threshold: u64,
    bonus_multiplier_bps: u64,
) -> u64 {
    if performance_score > threshold {
        base_salary.saturating_mul(bonus_multiplier_bps) / 10_000
    } else {
        0
    }
}

/// P5 — cliff + linear + cap. Caller must ensure `duration > 0`.
pub fn compute_vested_amount_sim(
    total_allocation: u64,
    elapsed_time: u64,
    cliff: u64,
    duration: u64,
) -> u64 {
    if elapsed_time < cliff {
        0
    } else {
        let linear = total_allocation.saturating_mul(elapsed_time) / duration;
        linear.min(total_allocation)
    }
}

/// P6 — additive, saturating.
pub fn compute_total_payout_sim(salary: u64, bonus: u64, vested: u64) -> u64 {
    salary.saturating_add(bonus).saturating_add(vested)
}

/// P10 — amount <= limit.
pub fn check_policy_compliance_sim(amount: u64, limit: u64) -> bool {
    amount <= limit
}
