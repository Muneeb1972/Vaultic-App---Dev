//! Property-based test harness for Vaultic (Req 31.2).
//!
//! Covers the invariants from Req 22 (FHE computation correctness) via
//! pure-Rust `_sim` mirrors of the `#[encrypt_fn]` graphs in
//! `programs/vaultic/src/fhe/mod.rs`. The simulators run on the host so
//! property tests stay decoupled from devnet timing and FHE gas cost.
//!
//! Properties currently exercised:
//!
//!   - **P3 (SalaryBandClamp)**      — `compute_salary_in_band_sim`
//!   - **P4 (BonusThresholdGate)**   — `compute_bonus_amount_sim`
//!   - **P5 (VestingCorrectness)**   — `compute_vested_amount_sim`
//!   - **P6 (AdditivePayout)**       — `compute_total_payout_sim`
//!   - **P10 (EncryptedPolicyCompliance)** — `check_policy_compliance_sim`
//!
//! Properties P1 (AccountRoundTrip) and P2 (PdaDeterminismUniqueness)
//! require pulling in the on-chain state structs and PDA derivations; they
//! are deferred pending either a BPF-free feature gate on the `vaultic`
//! crate OR a vendored copy of the structs here. Tasks 3.2 / 3.3 in the
//! spec mark them optional.

pub mod sim;

#[cfg(test)]
mod tests {
    use super::sim::*;
    use proptest::prelude::*;

    // --------------------------------------------------------------------
    // P3 — SalaryBandClamp  (Req 4.5, 22.1)
    // --------------------------------------------------------------------

    proptest! {
        /// For any `(salary, lo, hi)` with `lo <= hi`, the clamp output is
        /// bounded by the band and exactly `salary` when already inside.
        #[test]
        fn p3_salary_band_clamp(
            salary in 0u64..=u64::MAX,
            lo in 0u64..=u64::MAX,
            hi in 0u64..=u64::MAX,
        ) {
            prop_assume!(lo <= hi);
            let out = compute_salary_in_band_sim(salary, lo, hi);
            // Bound invariant.
            prop_assert!(out >= lo && out <= hi, "out {} not in [{}, {}]", out, lo, hi);
            // Idempotence for in-band values.
            if (lo..=hi).contains(&salary) {
                prop_assert_eq!(out, salary, "expected idempotent clamp for in-band input");
            }
        }

        /// At the band edges, the output equals the edge exactly — no
        /// off-by-one.
        #[test]
        fn p3_salary_band_clamp_edges(
            lo in 0u64..=u64::MAX,
            hi in 0u64..=u64::MAX,
        ) {
            prop_assume!(lo <= hi);
            prop_assert_eq!(compute_salary_in_band_sim(lo, lo, hi), lo);
            prop_assert_eq!(compute_salary_in_band_sim(hi, lo, hi), hi);
        }
    }

    // --------------------------------------------------------------------
    // P4 — BonusThresholdGate  (Req 4.6, 22.5)
    // --------------------------------------------------------------------

    proptest! {
        /// Threshold gate: result is zero iff `performance_score <= threshold`,
        /// else `(base * bps) / 10_000` with saturating multiplication.
        #[test]
        fn p4_bonus_threshold_gate(
            base in 0u64..=u64::MAX,
            perf in 0u64..=u64::MAX,
            thresh in 0u64..=u64::MAX,
            bps in 0u64..=20_000,
        ) {
            let out = compute_bonus_amount_sim(base, perf, thresh, bps);
            if perf <= thresh {
                prop_assert_eq!(out, 0, "expected zero below/at threshold");
            } else {
                prop_assert_eq!(out, base.saturating_mul(bps) / 10_000);
            }
        }

        /// Boundary: `perf == threshold` returns 0 (strict `>` gate).
        #[test]
        fn p4_bonus_at_threshold_is_zero(
            base in 0u64..=u64::MAX,
            thresh in 0u64..=u64::MAX,
            bps in 0u64..=20_000,
        ) {
            prop_assert_eq!(compute_bonus_amount_sim(base, thresh, thresh, bps), 0);
        }
    }

    // --------------------------------------------------------------------
    // P5 — VestingCorrectness  (Req 4.7, 22.2, 22.3)
    // --------------------------------------------------------------------

    proptest! {
        /// Cliff + linear + cap. `elapsed < cliff` ⇒ 0; otherwise the
        /// linear vested amount is capped at `total_allocation`.
        #[test]
        fn p5_vesting_correctness(
            total in 0u64..=u64::MAX,
            elapsed in 0u64..=u64::MAX,
            cliff in 0u64..=u64::MAX,
            duration in 1u64..=u64::MAX,
        ) {
            let out = compute_vested_amount_sim(total, elapsed, cliff, duration);
            if elapsed < cliff {
                prop_assert_eq!(out, 0, "expected zero before cliff");
            } else {
                let linear = total.saturating_mul(elapsed) / duration;
                prop_assert_eq!(out, linear.min(total), "expected min(linear, total)");
                prop_assert!(out <= total, "vested must never exceed total_allocation");
            }
        }

        /// After full duration with non-overflowing inputs, the vested
        /// amount equals the total allocation. If `total * elapsed`
        /// saturates, the result may be < total — skip those cases so the
        /// test isolates the "linear ≥ total ⇒ cap" invariant.
        #[test]
        fn p5_fully_vested_after_duration(
            total in 0u64..=1_000_000_000,
            cliff in 0u64..=1_000_000,
            duration in 1u64..=1_000_000,
        ) {
            let elapsed = cliff.saturating_add(duration);
            // Guard against saturating overflow so the cap invariant is
            // directly observable.
            prop_assume!(total.checked_mul(elapsed).is_some());
            let out = compute_vested_amount_sim(total, elapsed, cliff, duration);
            prop_assert_eq!(out, total);
        }
    }

    // --------------------------------------------------------------------
    // P6 — AdditivePayout  (Req 4.8, 22.4)
    // --------------------------------------------------------------------

    proptest! {
        /// Saturating addition across three components. Commutative &
        /// associative (up to saturation).
        #[test]
        fn p6_additive_payout(
            salary in 0u64..=u64::MAX,
            bonus in 0u64..=u64::MAX,
            vested in 0u64..=u64::MAX,
        ) {
            let out = compute_total_payout_sim(salary, bonus, vested);
            let expected = salary.saturating_add(bonus).saturating_add(vested);
            prop_assert_eq!(out, expected);
        }

        /// Identity under zero: adding 0 to any pair leaves the pair sum.
        #[test]
        fn p6_zero_identity(
            a in 0u64..=u64::MAX,
            b in 0u64..=u64::MAX,
        ) {
            let with_zero = compute_total_payout_sim(a, b, 0);
            let pair_sum = a.saturating_add(b);
            prop_assert_eq!(with_zero, pair_sum);
        }

        /// Commutative across any permutation of its three arguments
        /// (saturating addition is commutative and associative).
        #[test]
        fn p6_commutative(
            a in 0u64..=u64::MAX,
            b in 0u64..=u64::MAX,
            c in 0u64..=u64::MAX,
        ) {
            let x = compute_total_payout_sim(a, b, c);
            let y = compute_total_payout_sim(c, b, a);
            let z = compute_total_payout_sim(b, c, a);
            prop_assert_eq!(x, y);
            prop_assert_eq!(y, z);
        }
    }

    // --------------------------------------------------------------------
    // P10 — EncryptedPolicyCompliance  (Req 8.9)
    // --------------------------------------------------------------------

    proptest! {
        /// The plaintext mirror of `check_policy_compliance` — agrees with
        /// `<=` on the pair (commutativity of the ≤ relation, no extra
        /// wrinkles in the sim). Useful as a regression guard if anyone
        /// flips the operator (`<` vs `<=`) by mistake.
        #[test]
        fn p10_policy_compliance(
            amount in 0u64..=u64::MAX,
            limit in 0u64..=u64::MAX,
        ) {
            let out = check_policy_compliance_sim(amount, limit);
            prop_assert_eq!(out, amount <= limit);
        }

        /// Boundary: `amount == limit` is permitted (inclusive).
        #[test]
        fn p10_policy_boundary(amount in 0u64..=u64::MAX) {
            prop_assert!(check_policy_compliance_sim(amount, amount));
        }
    }
}
