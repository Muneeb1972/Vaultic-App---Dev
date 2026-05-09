"use client";

/**
 * SalaryBandVisualizer — 5 role-tier rows showing the encrypted salary
 * band references (Task 26.3, Req 16.1).
 *
 * Each row shows the tier label plus the shortened min/max ciphertext
 * pubkeys behind a lock icon. We never attempt to decrypt — these are
 * just visual references so the admin can verify which ciphertext blobs
 * are bound to each tier.
 *
 * Empty state: when the admin hasn't called `set_payroll_config` yet, we
 * render a CTA card directing them to configure it. The setup flow itself
 * is out of scope for Task 26.3 (deferred to a future task) — the CTA is
 * a placeholder.
 */
import { PublicKey } from "@solana/web3.js";
import { Lock } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PayrollConfigAccount } from "@/hooks/usePayrollConfig";
import { ROLE_LABELS, shortenAddress } from "@/lib/format";

export interface SalaryBandVisualizerProps {
  config: PayrollConfigAccount | null;
  isLoading: boolean;
}

/**
 * Convert an on-chain `[u8; 32]` ciphertext reference to a short base58
 * string. Anchor IDL arrays decode as `number[]`, so we build a
 * `PublicKey` from the byte array and then shorten its base58 encoding.
 */
function shortenCiphertextRef(bytes: number[] | Uint8Array): string {
  try {
    const key = new PublicKey(Uint8Array.from(bytes));
    if (key.equals(PublicKey.default)) return "unset";
    return shortenAddress(key, 4);
  } catch {
    return "invalid";
  }
}

export function SalaryBandVisualizer({
  config,
  isLoading,
}: SalaryBandVisualizerProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Salary Bands</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  if (!config) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Salary Bands</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            No payroll configuration yet.
          </p>
          <p className="text-xs text-muted-foreground">
            Configure encrypted salary bands to unlock payroll execution.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Salary Bands</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {ROLE_LABELS.map((label, tierIdx) => {
          const min = config.bandMin[tierIdx] ?? [];
          const max = config.bandMax[tierIdx] ?? [];
          return (
            <div
              key={label}
              className="flex items-center justify-between rounded-md border border-border/60 bg-card/60 px-4 py-3"
            >
              <span className="text-sm font-medium text-foreground">
                {label}
              </span>
              <div className="flex items-center gap-4 font-mono text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Lock className="h-3 w-3" />
                  min {shortenCiphertextRef(min as unknown as number[])}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Lock className="h-3 w-3" />
                  max {shortenCiphertextRef(max as unknown as number[])}
                </span>
              </div>
            </div>
          );
        })}
        <p className="pt-2 text-xs text-muted-foreground">
          Bonus multiplier: {config.bonusMultiplierBps} bps
        </p>
      </CardContent>
    </Card>
  );
}
