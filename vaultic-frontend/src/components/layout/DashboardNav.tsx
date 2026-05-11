"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, LayoutDashboard, Users, Coins, ShieldCheck } from "lucide-react";
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

const NAV_ITEMS: { href: string; label: string; exact?: boolean; icon: React.ComponentType<{ className?: string }> }[] = [
  { href: "/dashboard",            label: "Dashboard", exact: true,  icon: LayoutDashboard },
  { href: "/dashboard/employees",  label: "Employees",               icon: Users },
  { href: "/dashboard/payroll",    label: "Payroll",                 icon: Coins },
  { href: "/dashboard/policies",   label: "Policies",                icon: ShieldCheck },
];

function isItemActive(pathname: string | null, href: string, exact?: boolean) {
  if (!pathname) return false;
  return exact ? pathname === href : pathname.startsWith(href);
}

/* Inline SVG logo — same shield as landing page */
function NavLogo() {
  return (
    <svg viewBox="0 0 32 32" fill="none" className="h-7 w-7" aria-hidden>
      <path
        d="M16 2L4 7V16C4 22.4 9.4 28.2 16 30C22.6 28.2 28 22.4 28 16V7L16 2Z"
        fill="url(#nav-shield)"
      />
      <rect x="10.5" y="15" width="11" height="8" rx="1.5" fill="white" opacity="0.9" />
      <path d="M12 15V12C12 9.79 13.79 8 16 8C18.21 8 20 9.79 20 12V15"
        stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.9" />
      <circle cx="16" cy="18.5" r="1.5" fill="url(#nav-shield)" />
      <defs>
        <linearGradient id="nav-shield" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function DashboardNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header
      className="sticky top-10 z-40 backdrop-blur-xl"
      style={{
        background: "rgba(5,5,15,0.85)",
        borderBottom: "1px solid rgba(99,102,241,0.15)",
        boxShadow: "0 1px 24px rgba(0,0,0,0.4)",
      }}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:px-6">

        {/* Left: logo + nav */}
        <div className="flex items-center gap-3">
          {/* Mobile hamburger */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="flex flex-col gap-6"
              style={{ background: "rgba(5,5,15,0.97)", borderRight: "1px solid rgba(99,102,241,0.15)" }}
            >
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <NavLogo />
                  <span
                    className="text-sm font-bold uppercase tracking-widest"
                    style={{
                      background: "linear-gradient(135deg, #e0e7ff, #a5b4fc)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    Vaultic
                  </span>
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1">
                {NAV_ITEMS.map((item) => {
                  const active = isItemActive(pathname, item.href, item.exact);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                        active
                          ? "text-white"
                          : "text-slate-400 hover:text-white",
                      )}
                      style={active ? {
                        background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(59,130,246,0.1))",
                        border: "1px solid rgba(99,102,241,0.3)",
                      } : {}}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>

          {/* Logo */}
          <Link
            href="/?home=1"
            className="flex items-center gap-2 group"
          >
            <NavLogo />
            <span
              className="hidden text-sm font-bold uppercase tracking-widest md:block"
              style={{
                background: "linear-gradient(135deg, #e0e7ff, #a5b4fc)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Vaultic
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="ml-2 hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => {
              const active = isItemActive(pathname, item.href, item.exact);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium transition-all duration-200",
                    active ? "text-white" : "text-slate-400 hover:text-slate-200",
                  )}
                  style={active ? {
                    background: "linear-gradient(135deg, rgba(99,102,241,0.18), rgba(59,130,246,0.08))",
                    border: "1px solid rgba(99,102,241,0.25)",
                  } : {}}
                >
                  <Icon className="h-3.5 w-3.5" />
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
