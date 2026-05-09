"use client";

/**
 * Portal route guard (Task 24.2, Req 19.3–19.5).
 *
 * Employee-only surface. Mirror of the dashboard guard with the admin
 * branch swapped:
 *   - `guest`   (no wallet)         → `/`
 *   - `admin`                       → `/dashboard`
 *   - `unknown` (connected, no role) → `/`
 *   - `employee`                    → render `{children}`
 *
 * The DOM skeleton matches `app/dashboard/layout.tsx` deliberately so both
 * surfaces share the same loading chrome; the only difference is the
 * role-target gating above.
 */
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { PortalNav } from "@/components/layout/PortalNav";
import { Skeleton } from "@/components/ui/skeleton";
import { useRole } from "@/hooks/useRole";

export const dynamic = "force-dynamic";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { data: role, isLoading } = useRole();

  useEffect(() => {
    if (isLoading || role === undefined) return;
    if (role === "employee") return;
    if (role === "admin") {
      router.replace("/dashboard");
      return;
    }
    // guest / unknown → landing
    router.replace("/");
  }, [role, isLoading, router]);

  if (isLoading || role === undefined || role !== "employee") {
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
      <PortalNav />
      {children}
    </div>
  );
}
