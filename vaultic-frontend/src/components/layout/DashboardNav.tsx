"use client";

/**
 * DashboardNav — nav bar mounted above every page in the admin dashboard
 * (Task 26, Task 28).
 *
 * Responsive behaviour (Req 20.1):
 *   - `md:` (≥768px) — horizontal nav links inline with the logo.
 *   - below `md:`   — hamburger icon that opens a left-side Sheet drawer
 *                     containing the same links stacked vertically.
 *
 * Active-link highlighting uses `usePathname()` so the selected tab
 * updates on client-side route transitions. Startswith-match is used so
 * `/dashboard/employees/anything` still highlights "Employees".
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { WalletButton } from "@/components/wallet/WalletButton";
import { cn } from "@/lib/utils";

const NAV_ITEMS: ReadonlyArray<{
  href: string;
  label: string;
  exact?: boolean;
}> = [
  { href: "/dashboard", label: "Dashboard", exact: true },
  { href: "/dashboard/employees", label: "Employees" },
  { href: "/dashboard/payroll", label: "Payroll" },
  { href: "/dashboard/policies", label: "Policies" },
];

function isItemActive(
  pathname: string | null,
  href: string,
  exact?: boolean,
): boolean {
  if (!pathname) return false;
  return exact ? pathname === href : pathname.startsWith(href);
}

export function DashboardNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-10 z-40 border-b border-border/60 bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-2">
          {/* Mobile hamburger trigger */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex flex-col gap-6">
              <SheetHeader>
                <SheetTitle>Vaultic</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1">
                {NAV_ITEMS.map((item) => {
                  const active = isItemActive(pathname, item.href, item.exact);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>

          <Link
            href="/dashboard"
            className="text-sm font-semibold uppercase tracking-[0.2em] text-primary"
          >
            Vaultic
          </Link>

          {/* Desktop horizontal nav */}
          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => {
              const active = isItemActive(pathname, item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <WalletButton />
      </div>
    </header>
  );
}
