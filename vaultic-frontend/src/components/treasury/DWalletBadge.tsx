"use client";

/**
 * DWalletBadge — displays the treasury's dWallet id + curve type
 * (Task 26.1, Req 14 / Req 28).
 *
 * The dWallet stays at `Pubkey::default()` (all-zeros) until the admin
 * calls `create_dwallet`. We detect this sentinel and render an empty
 * state CTA so the user knows a DKG ceremony is needed.
 */
import { PublicKey } from "@solana/web3.js";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { curveLabel, shortenAddress } from "@/lib/format";
import type { TreasuryAccount } from "@/hooks/useTreasury";

export interface DWalletBadgeProps {
  treasury: TreasuryAccount | null;
}

/** `PublicKey::default()` serialises as 32 zero bytes — we treat it as "unset". */
function isZeroKey(key: PublicKey): boolean {
  return key.equals(PublicKey.default);
}

export function DWalletBadge({ treasury }: DWalletBadgeProps) {
  if (!treasury) return null;

  const unset = isZeroKey(treasury.dwalletId);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          dWallet
        </CardTitle>
      </CardHeader>
      <CardContent>
        {unset ? (
          <div className="space-y-1">
            <p className="text-base font-medium text-foreground">Not bound</p>
            <p className="text-xs text-muted-foreground">
              Run DKG to bind a dWallet (Ika).
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="font-mono text-base text-foreground">
              {shortenAddress(treasury.dwalletId, 6)}
            </p>
            <p className="text-xs text-muted-foreground">
              Curve: {curveLabel(treasury.dwalletCurveType)}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
