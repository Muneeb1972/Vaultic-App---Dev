"use client";

/**
 * Dashboard route guard (Task 24.2, Req 19.3–19.5) + shared nav chrome
 * (Task 26).
 *
 * Admin-only surface. Resolution table:
 *   - `guest`   (no wallet)        → `/`
 *   - `employee`                   → `/portal`
 *   - `unknown` (connected, no role) → `/`
 *   - `admin`                      → render `<DashboardNav /> + {children}`
 *
 * The redirects run inside `useEffect` (not during render) because
 * `router.replace` is a side effect; doing it at render time would blow up
 * React's concurrent rendering contract. While the role query is in flight
 * we render a skeleton so the user sees stable chrome instead of a flash of
 * landing-page content.
 *
 * `dynamic = 'force-dynamic'` opts the segment out of Next.js's static
 * generation pass. Anchor + `@solana/web3.js` pull in WebSocket/fetch shims
 * that the prerender runtime can't resolve; forcing dynamic keeps the
 * build green without pulling the provider tree out of the root layout.
 *
 * ## Encrypt deposit bootstrap (encrypt-integration Req 3.2, Task 16.3)
 *
 * `useEnsureDeposit` is invoked once per wallet connection from this layout.
 * It checks whether the connected wallet's Encrypt deposit PDA exists and,
 * if not, submits the `create_deposit` instruction silently. The result is
 * cached in React state for the remainder of the session so subsequent
 * mutations do not re-check.
 *
 * The bootstrap runs only for admin users (this layout) and only after the
 * role check confirms `admin`. Employee-only flows (`/portal`) do not create
 * ciphertexts and therefore do not need the deposit PDA (Req 3.7).
 */
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { DashboardNav } from "@/components/layout/DashboardNav";
import { Skeleton } from "@/components/ui/skeleton";
import { useRole } from "@/hooks/useRole";
import { useEnsureDeposit } from "@/hooks/useEnsureDeposit";

export const dynamic = "force-dynamic";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { data: role, isLoading } = useRole();

  // Encrypt deposit bootstrap — fires once per wallet connection when the
  // admin dashboard is first rendered (Req 3.2, Task 16.3).
  const { ensureDeposit: runEnsureDeposit, isEnsured } = useEnsureDeposit();

  useEffect(() => {
    if (isLoading || role === undefined) return;
    if (role === "admin") return;
    if (role === "employee") {
      router.replace("/portal");
      return;
    }
    // guest / unknown → landing
    router.replace("/");
  }, [role, isLoading, router]);

  // Trigger the deposit bootstrap once the admin role is confirmed and the
  // deposit hasn't been ensured yet for this session.
  useEffect(() => {
    if (role !== "admin" || isEnsured) return;
    // Fire-and-forget — errors are surfaced via the EncryptPhase state in
    // the hook and displayed by the form components when they attempt to
    // submit. We don't block the dashboard render on this.
    void runEnsureDeposit().catch(() => {
      // Silently swallow here; the hook already sets its own error phase.
    });
  }, [role, isEnsured, runEnsureDeposit]);

  if (isLoading || role === undefined || role !== "admin") {
    return (
      <div className="min-h-screen bg-background px-6 py-10">
        <div className="mx-auto max-w-6xl space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav />
      {children}
    </div>
  );
}
