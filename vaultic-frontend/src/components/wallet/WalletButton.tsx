"use client";

/**
 * WalletButton — thin client wrapper around `WalletMultiButton` (Task 23.1).
 *
 * The adapter's `WalletMultiButton` renders its own Connect / Disconnect /
 * address UI and opens the wallet modal mounted by `WalletModalProvider`.
 * Exposing it through our own component gives us a single place to later
 * tweak styling (e.g. matching Tailwind tokens) without touching every call
 * site, and keeps the `"use client"` directive colocated with the import.
 */
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export interface WalletButtonProps {
  className?: string;
}

export function WalletButton({ className }: WalletButtonProps) {
  return <WalletMultiButton className={className} />;
}
