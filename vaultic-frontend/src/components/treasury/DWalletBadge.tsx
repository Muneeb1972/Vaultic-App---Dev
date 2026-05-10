"use client";

import { PublicKey } from "@solana/web3.js";
import { Link2, Link2Off, Cpu } from "lucide-react";
import { curveLabel, shortenAddress } from "@/lib/format";
import type { TreasuryAccount } from "@/hooks/useTreasury";

export interface DWalletBadgeProps {
  treasury: TreasuryAccount | null;
}

function isZeroKey(key: PublicKey): boolean {
  return key.equals(PublicKey.default);
}

export function DWalletBadge({ treasury }: DWalletBadgeProps) {
  if (!treasury) return null;

  const unset = isZeroKey(treasury.dwalletId);

  return (
    <div
      className="group relative overflow-hidden rounded-2xl p-5 transition-all duration-300 hover:-translate-y-0.5"
      style={{
        background: "rgba(10,10,20,0.7)",
        border: `1px solid ${unset ? "rgba(239,68,68,0.35)" : "rgba(99,102,241,0.45)"}`,
        backdropFilter: "blur(16px)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = unset
          ? "rgba(239,68,68,0.6)"
          : "rgba(99,102,241,0.7)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = unset
          ? "0 8px 32px rgba(239,68,68,0.08)"
          : "0 8px 32px rgba(99,102,241,0.12)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = unset
          ? "rgba(239,68,68,0.35)"
          : "rgba(99,102,241,0.45)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
      }}
    >
      {/* Background gradient */}
      <div
        className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: unset
            ? "linear-gradient(135deg, rgba(239,68,68,0.06), transparent)"
            : "linear-gradient(135deg, rgba(99,102,241,0.1), rgba(59,130,246,0.05))",
        }}
      />
      {/* Top accent */}
      <div
        className="absolute inset-x-0 top-0 h-px opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: unset
            ? "linear-gradient(90deg, transparent, rgba(239,68,68,0.5), transparent)"
            : "linear-gradient(90deg, transparent, rgba(99,102,241,0.6), transparent)",
        }}
      />

      <div className="relative">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-widest" style={{ color: "rgba(148,163,184,0.7)" }}>
            dWallet
          </p>
          <div
            className="flex h-8 w-8 items-center justify-center rounded-xl"
            style={{
              background: unset ? "rgba(239,68,68,0.12)" : "rgba(99,102,241,0.15)",
            }}
          >
            {unset
              ? <Link2Off className="h-4 w-4" style={{ color: "#f87171" }} />
              : <Link2 className="h-4 w-4" style={{ color: "#818cf8" }} />
            }
          </div>
        </div>

        {unset ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                style={{
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.25)",
                  color: "#f87171",
                }}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                Not Bound
              </span>
            </div>
            <p className="text-sm" style={{ color: "rgba(203,213,225,0.85)" }}>
              Run DKG ceremony to bind an Ika dWallet to this treasury.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                style={{
                  background: "rgba(99,102,241,0.12)",
                  border: "1px solid rgba(99,102,241,0.3)",
                  color: "#a5b4fc",
                }}
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-violet-500" />
                </span>
                Active
              </span>
            </div>
            <p
              className="font-mono text-base font-semibold"
              style={{
                background: "linear-gradient(135deg, #e0e7ff, #a5b4fc)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              {shortenAddress(treasury.dwalletId, 6)}
            </p>
            <div className="flex items-center gap-2">
              <Cpu className="h-3.5 w-3.5" style={{ color: "rgba(148,163,184,0.5)" }} />
              <p className="text-xs" style={{ color: "rgba(203,213,225,0.75)" }}>
                Curve: {curveLabel(treasury.dwalletCurveType)}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
