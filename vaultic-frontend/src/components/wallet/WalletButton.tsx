"use client";

/**
 * WalletButton — thin client wrapper around `WalletMultiButton` (Task 23.1).
 *
 * Rendered only on the client to avoid SSR/hydration mismatches caused by
 * the wallet adapter reading browser-only state (localStorage, extensions).
 */
import dynamic from "next/dynamic";

// Dynamic import with ssr:false prevents the hydration mismatch that occurs
// when WalletMultiButton renders differently on server vs client.
const WalletMultiButtonDynamic = dynamic(
  async () => {
    const { WalletMultiButton } = await import("@solana/wallet-adapter-react-ui");
    return WalletMultiButton;
  },
  { ssr: false },
);

export interface WalletButtonProps {
  className?: string;
}

export function WalletButton({ className }: WalletButtonProps) {
  return <WalletMultiButtonDynamic className={className} />;
}
