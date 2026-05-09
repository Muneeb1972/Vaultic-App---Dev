"use client";

/**
 * LandingHero — client-side hero + feature card block for `/` (Task 25,
 * Req 13.1–13.4).
 *
 * Client-only because it does two things that a server component can't:
 *   1. Renders `<WalletButton />`, which mounts the wallet adapter modal
 *      host. The modal needs `useWallet()` / `useWalletModal()` which are
 *      only available inside `"use client"` boundaries.
 *   2. Auto-redirects the user once `useRole()` resolves to `admin` or
 *      `employee` — this matches the "Wallet connect + role detection"
 *      sequence in design §3.3.6.
 *
 * Redirect gating is intentionally narrow: only `admin` → `/dashboard`
 * and `employee` → `/portal`. `guest` stays on the landing page so the
 * hero is visible pre-connect, and `unknown` (connected but no on-chain
 * role) also stays here rather than being punted in a loop back from the
 * route guards.
 *
 * Styling notes:
 *   - The hero background uses two radial gradients tinted with the
 *     `primary` (#3b82f6) and `accent` (#6366f1) tokens from globals.css,
 *     layered over the base `#0a0a0f` background. The gradients are built
 *     as inline `backgroundImage` styles because Tailwind doesn't have
 *     arbitrary radial syntax in its core utility set.
 *   - Feature cards use the shadcn `Card` primitive so they inherit the
 *     theme's `--card` / `--border` tokens without bespoke styling.
 *   - Tagline uses `text-6xl md:text-7xl` so it scales on desktop; the
 *     `text-balance` utility (defined in globals.css) prevents orphan
 *     words on narrow viewports.
 */
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InitializeTreasuryDialog } from "@/components/treasury/InitializeTreasuryDialog";
import { WalletButton } from "@/components/wallet/WalletButton";
import { useRole } from "@/hooks/useRole";

const FEATURES = [
  {
    title: "FHE Payroll Privacy",
    description:
      "Encrypted salary compute — results never decrypted on-chain.",
  },
  {
    title: "Bridgeless Execution",
    description:
      "Ika dWallets sign cross-chain transactions without wrapping assets.",
  },
  {
    title: "Policy Governance",
    description:
      "Multi-sig approvals, spending limits, and time-locks enforced on-chain.",
  },
];

export function LandingHero() {
  const router = useRouter();
  const { data: role } = useRole();

  useEffect(() => {
    if (role === "admin") {
      router.replace("/dashboard");
    } else if (role === "employee") {
      router.replace("/portal");
    }
  }, [role, router]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      {/* Radial gradient accents layered over the dark base. `-z-10` keeps
          them behind content; `pointer-events-none` prevents them from
          intercepting the connect-wallet click. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, hsl(217 91% 60% / 0.18), transparent 55%), radial-gradient(circle at 80% 60%, hsl(239 84% 67% / 0.18), transparent 55%)",
        }}
      />

      <section className="mx-auto flex max-w-6xl flex-col items-center px-6 pb-24 pt-32 text-center md:pt-40">
        <p className="mb-6 text-sm font-medium uppercase tracking-[0.2em] text-primary">
          Vaultic
        </p>
        <h1 className="text-balance text-5xl font-semibold tracking-tight text-foreground md:text-7xl">
          Encrypt. Control. Execute.
        </h1>
        <p className="mt-6 max-w-2xl text-balance text-lg text-muted-foreground md:text-xl">
          Privacy-first, encrypted, bridgeless treasury OS for Solana DAOs.
        </p>
        <div className="mt-10 flex flex-col items-center gap-3">
          <WalletButton />
          {role === "unknown" && (
            <>
              <p className="text-sm text-muted-foreground">
                Wallet connected but no treasury or employee record found.
              </p>
              <InitializeTreasuryDialog />
            </>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-32">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card
              key={feature.title}
              className="border-border/60 bg-card/80 backdrop-blur"
            >
              <CardHeader>
                <CardTitle className="text-lg text-foreground">
                  {feature.title}
                </CardTitle>
                <CardDescription className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
