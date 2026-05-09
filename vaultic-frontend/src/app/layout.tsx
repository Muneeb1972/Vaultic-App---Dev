import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";

import { DevnetBanner } from "@/components/layout/DevnetBanner";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { VaulticWalletProvider } from "@/components/wallet/WalletProvider";

import "./globals.css";

// Inter is loaded via `next/font/google` per design §3.3.4 and task 22.2.
// Using the `variable` form so Tailwind's `fontFamily.sans` can reference it.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Vaultic — Encrypt. Control. Execute.",
  description:
    "Privacy-first, encrypted, bridgeless treasury OS for DAOs on Solana.",
};

/**
 * Provider nesting order (Task 23.1, design §3.3.3):
 *   1. `QueryProvider`   — TanStack Query client with 30 s staleTime; the
 *      outermost client boundary so every hook below can call `useQuery`.
 *   2. `VaulticWalletProvider` — wraps `ConnectionProvider`, `WalletProvider`,
 *      and `WalletModalProvider`; nested inside QueryProvider so queries
 *      keyed off the connected wallet invalidate cleanly when the wallet
 *      changes.
 *   3. `DevnetBanner`    — rendered above `{children}` at the body root so
 *      it's always visible regardless of page-level layouts.
 *   4. `<Toaster />`     — sonner host, placed last so toasts render above
 *      page content via its own portal.
 *
 * The layout itself stays a server component; the provider components carry
 * their own `"use client"` directives where needed.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${inter.className} antialiased`}>
        <DevnetBanner />
        <QueryProvider>
          <VaulticWalletProvider>{children}</VaulticWalletProvider>
        </QueryProvider>
        <Toaster richColors theme="dark" position="bottom-right" />
      </body>
    </html>
  );
}
