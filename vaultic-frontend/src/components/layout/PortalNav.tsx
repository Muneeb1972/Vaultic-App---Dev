"use client";

/**
 * PortalNav — nav bar for the employee portal (Task 28, Req 18, 20.1).
 *
 * Mirrors `DashboardNav` behaviour but with portal-scoped links:
 *   - `/portal`       → Home
 *   - `/portal/claim` → Claims
 *
 * Responsive: horizontal nav above `md:`, hamburger drawer below.
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
  { href: "/portal", label: "Home", exact: true },
  { href: "/portal/claim", label: "Claims" },
];

function isItemActive(
  pathname: string | null,
  href: string,
  exact?: boolean,
): boolean {
  if (!pathname) return false;
  return exact ? pathname === href : pathname.startsWith(href);
}

export function PortalNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-10 z-40 border-b border-border/60 bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-2">
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
                <SheetTitle>My Vaultic</SheetTitle>
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
            href="/portal"
            className="text-sm font-semibold uppercase tracking-[0.2em] text-primary"
          >
            Vaultic
          </Link>

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
