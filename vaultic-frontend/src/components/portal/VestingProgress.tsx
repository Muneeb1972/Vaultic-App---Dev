"use client";

/**
 * VestingProgress — visualises the employee's vesting schedule
 * (Task 27.1, Req 18.2).
 *
 * The `EmployeeRecord` on-chain carries the three ingredients we need:
 *   - `vestingStart` (i64) — unix seconds
 *   - `vestingCliff` (i64) — seconds offset from `vestingStart`
 *   - `vestingDuration` (i64) — total vesting span in seconds
 *   - `totalAllocation` (u64) — lamports allocated
 *   - `totalClaimed` (u64) — cumulative lamports claimed so far
 *
 * Progress math:
 *   - `pct = vestingProgressPct(start, duration, now)` — clamped [0, 100].
 *   - `vestedLamports = totalAllocation * pct / 100` (integer math via BN).
 *   - `available = vestedLamports - totalClaimed`, floored at 0.
 *
 * The timeline marker overlays three anchor points (start / cliff / end)
 * on a horizontal bar with a "now" indicator. Kept intentionally simple:
 * the bar is CSS-only, no charting library needed for a 3-anchor axis.
 */
import { BN } from "@coral-xyz/anchor";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatLamportsSol, formatUnixTimestamp, vestingProgressPct } from "@/lib/format";
import type { EmployeeRecordAccount } from "@/hooks/useMyEmployee";

export interface VestingProgressProps {
  employee: EmployeeRecordAccount;
}

/**
 * Return the relative position of a unix timestamp along the
 * `[start, end]` span as a percentage (0..=100). Used to place the
 * cliff and "now" markers on the timeline bar.
 */
function markerPct(ts: number, start: number, end: number): number {
  if (end <= start) return 0;
  const pct = ((ts - start) / (end - start)) * 100;
  if (pct < 0) return 0;
  if (pct > 100) return 100;
  return pct;
}

export function VestingProgress({ employee }: VestingProgressProps) {
  const start = employee.vestingStart.toNumber();
  const duration = employee.vestingDuration.toNumber();
  const cliff = employee.vestingCliff.toNumber();
  const end = start + duration;
  const cliffTs = start + cliff;
  const now = Math.floor(Date.now() / 1000);

  const pct = vestingProgressPct(employee.vestingStart, employee.vestingDuration, now);

  // Integer math: vested = totalAllocation * pct / 100. Keeps us in BN
  // land so values > 2^53 round-trip through the u64 space cleanly.
  const vested = employee.totalAllocation.muln(pct).divn(100);
  const claimed = employee.totalClaimed;
  const availableBn = vested.sub(claimed);
  const available = availableBn.isNeg() ? new BN(0) : availableBn;

  const nowPct = markerPct(now, start, end);
  const cliffPctPos = markerPct(cliffTs, start, end);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vesting</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">
              {pct}% vested
            </span>
            <span className="text-xs text-muted-foreground">
              {formatUnixTimestamp(employee.vestingStart)} →{" "}
              {formatUnixTimestamp(new BN(end))}
            </span>
          </div>

          {/*
            Timeline:
              - background bar = full duration
              - filled segment = vested %
              - absolute-positioned markers for cliff (dashed tick) and
                "now" (solid tick)
          */}
          <div className="relative h-3 w-full overflow-visible rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${pct}%` }}
            />
            {cliff > 0 && cliff < duration ? (
              <div
                className="absolute top-[-4px] h-5 w-0.5 bg-amber-400/80"
                style={{ left: `${cliffPctPos}%` }}
                title={`Cliff: ${formatUnixTimestamp(new BN(cliffTs))}`}
              />
            ) : null}
            <div
              className="absolute top-[-4px] h-5 w-0.5 bg-foreground"
              style={{ left: `${nowPct}%` }}
              title="Now"
            />
          </div>

          <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>Start</span>
            {cliff > 0 && cliff < duration ? (
              <span style={{ position: "relative", left: `${cliffPctPos - 50}%` }}>
                Cliff
              </span>
            ) : null}
            <span>End</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Stat label="Total Allocation" value={formatLamportsSol(employee.totalAllocation)} />
          <Stat label="Total Claimed" value={formatLamportsSol(employee.totalClaimed)} />
          <Stat label="Available to Claim" value={formatLamportsSol(available)} />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 px-4 py-3">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}
