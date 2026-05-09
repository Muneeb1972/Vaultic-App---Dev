"use client";

/**
 * VaulticWalletProvider — Solana wallet plumbing for the whole app (Task 23.1).
 *
 * This is the single place where we instantiate `ConnectionProvider`,
 * `WalletProvider`, and `WalletModalProvider` from `@solana/wallet-adapter-react*`.
 * Mounted once at the root of `app/layout.tsx` via the `QueryProvider` wrapper
 * so every client component can call `useConnection()` / `useWallet()` /
 * `useAnchorWallet()` without re-establishing the Solana RPC connection.
 *
 * Wallet support (Req 19.1, design §3.3.3):
 *   - Phantom and Solflare are wired through explicit adapters from
 *     `@solana/wallet-adapter-wallets`.
 *   - Backpack ships as a Wallet Standard wallet — it announces itself to
 *     `WalletProvider` via `window.registerWallet(...)` the moment the
 *     extension loads, so no dedicated adapter is required (and none is
 *     exported by `@solana/wallet-adapter-wallets` in this version). The
 *     modal picks it up automatically when the user has Backpack installed.
 *
 * Endpoint source of truth is `NEXT_PUBLIC_SOLANA_RPC_URL` (design §10.5). We
 * fall back to devnet's public endpoint when the env var is missing so
 * development builds don't hard-crash before `.env.local` is populated; the
 * DevnetBanner still surfaces the cluster to the user.
 *
 * CSS import: the wallet modal's stylesheet lives in the adapter package and
 * MUST be imported from a client component (Next.js 14 does not allow CSS
 * imports from node_modules in server components). That's why this file
 * carries both the `"use client"` directive and the `styles.css` import.
 */
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { useMemo, type ReactNode } from "react";

import "@solana/wallet-adapter-react-ui/styles.css";

/**
 * Public devnet fallback kept in sync with `.env.example`. Used only when
 * `NEXT_PUBLIC_SOLANA_RPC_URL` is unset so local dev doesn't crash before
 * env wiring; production builds populate the env var at build time.
 */
const DEFAULT_RPC_URL = "https://api.devnet.solana.com";

export interface VaulticWalletProviderProps {
  children: ReactNode;
}

export function VaulticWalletProvider({
  children,
}: VaulticWalletProviderProps) {
  const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? DEFAULT_RPC_URL;

  // Memoize so the adapter array is referentially stable across renders; the
  // adapter classes are heavy (they open event listeners on mount) and the
  // WalletProvider re-initialises them on any new reference. Backpack is
  // omitted here on purpose — it registers itself via the Wallet Standard,
  // and `WalletProvider` picks it up automatically.
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
