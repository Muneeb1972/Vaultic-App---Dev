"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { WalletButton } from "@/components/wallet/WalletButton";
import { InitializeTreasuryDialog } from "@/components/treasury/InitializeTreasuryDialog";
import { useRole } from "@/hooks/useRole";

/* ── Static star data (generated once, stable across renders) ─────────── */
const STARS = Array.from({ length: 80 }, (_, i) => ({
  id: i,
  top: ((i * 137.508) % 100).toFixed(2),
  left: ((i * 97.3) % 100).toFixed(2),
  size: (((i * 31) % 3) + 1).toFixed(1),
  delay: ((i * 0.37) % 5).toFixed(2),
  duration: (((i * 53) % 4) + 2).toFixed(1),
}));

/* ── Feature cards ────────────────────────────────────────────────────── */
const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
      </svg>
    ),
    gradient: "from-blue-500/20 to-cyan-500/10",
    iconBg: "bg-blue-500/15 text-blue-400",
    border: "hover:border-blue-500/40",
    glow: "hover:shadow-blue-500/10",
    title: "FHE Payroll Privacy",
    description:
      "Salary computations run inside Fully Homomorphic Encryption — results are verified on-chain without ever exposing raw figures.",
    badge: "Powered by Encrypt",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
      </svg>
    ),
    gradient: "from-violet-500/20 to-purple-500/10",
    iconBg: "bg-violet-500/15 text-violet-400",
    border: "hover:border-violet-500/40",
    glow: "hover:shadow-violet-500/10",
    title: "Bridgeless Execution",
    description:
      "Ika dWallets sign cross-chain transactions natively — no wrapped assets, no bridges, no custodial risk.",
    badge: "Powered by Ika",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
    gradient: "from-indigo-500/20 to-blue-500/10",
    iconBg: "bg-indigo-500/15 text-indigo-400",
    border: "hover:border-indigo-500/40",
    glow: "hover:shadow-indigo-500/10",
    title: "Policy Governance",
    description:
      "Multi-sig approvals, configurable spending limits, and time-locks enforced directly on-chain — no off-chain coordination.",
    badge: "On-chain Rules",
  },
];

/* ── Stats ────────────────────────────────────────────────────────────── */
const STATS = [
  { value: "100%", label: "On-chain" },
  { value: "FHE", label: "Encrypted" },
  { value: "0", label: "Bridges" },
  { value: "DAO", label: "Native" },
];

/* ── VaulticLogo SVG ──────────────────────────────────────────────────── */
function VaulticLogo({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Vaultic logo"
    >
      {/* Shield body */}
      <path
        d="M24 3L6 10.5V24C6 33.6 14.1 42.3 24 45C33.9 42.3 42 33.6 42 24V10.5L24 3Z"
        fill="url(#shield-gradient)"
        opacity="0.9"
      />
      {/* Shield border */}
      <path
        d="M24 3L6 10.5V24C6 33.6 14.1 42.3 24 45C33.9 42.3 42 33.6 42 24V10.5L24 3Z"
        stroke="url(#border-gradient)"
        strokeWidth="1.5"
        fill="none"
      />
      {/* Lock body */}
      <rect x="16" y="22" width="16" height="12" rx="2" fill="white" opacity="0.9" />
      {/* Lock shackle */}
      <path
        d="M18 22V18C18 14.686 20.686 12 24 12C27.314 12 30 14.686 30 18V22"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.9"
      />
      {/* Keyhole */}
      <circle cx="24" cy="27" r="2" fill="url(#shield-gradient)" />
      <rect x="23" y="27" width="2" height="3" rx="1" fill="url(#shield-gradient)" />
      {/* Defs */}
      <defs>
        <linearGradient id="shield-gradient" x1="6" y1="3" x2="42" y2="45" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="50%" stopColor="#4f46e5" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
        <linearGradient id="border-gradient" x1="6" y1="3" x2="42" y2="45" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#818cf8" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.4" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* ── Main component ───────────────────────────────────────────────────── */
export function LandingHero() {
  const router = useRouter();
  const { data: role } = useRole();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // If the user explicitly navigated home from the nav, skip the
    // auto-redirect and clear the flag so normal behaviour resumes on
    // the next visit.
    try {
      if (sessionStorage.getItem("vaultic_nav_home") === "1") {
        sessionStorage.removeItem("vaultic_nav_home");
        return;
      }
    } catch {}

    if (role === "admin") router.replace("/dashboard");
    else if (role === "employee") router.replace("/portal");
  }, [role, router]);

  /* Animated canvas grid */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animFrame: number;
    let offset = 0;

    const draw = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const spacing = 60;
      ctx.strokeStyle = "rgba(99,102,241,0.07)";
      ctx.lineWidth = 1;

      // Vertical lines
      for (let x = 0; x < canvas.width + spacing; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      // Horizontal lines (moving)
      for (let y = (offset % spacing) - spacing; y < canvas.height + spacing; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      offset += 0.3;
      animFrame = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animFrame);
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden" style={{ background: "#05050f" }}>

      {/* ── Animated canvas grid ─────────────────────────────────────── */}
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full opacity-100"
      />

      {/* ── Deep space gradient background ───────────────────────────── */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(99,102,241,0.22) 0%, transparent 60%)," +
            "radial-gradient(ellipse 60% 50% at 80% 80%, rgba(59,130,246,0.14) 0%, transparent 55%)," +
            "radial-gradient(ellipse 50% 40% at 10% 70%, rgba(139,92,246,0.12) 0%, transparent 50%)",
        }}
      />

      {/* ── Stars ────────────────────────────────────────────────────── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {STARS.map((star) => (
          <div
            key={star.id}
            className="absolute rounded-full bg-white animate-twinkle"
            style={{
              top: `${star.top}%`,
              left: `${star.left}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
              animationDelay: `${star.delay}s`,
              animationDuration: `${star.duration}s`,
              opacity: 0.3,
            }}
          />
        ))}
      </div>

      {/* ── Floating orbs ────────────────────────────────────────────── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Top-left orb */}
        <div
          className="absolute animate-float"
          style={{
            top: "8%", left: "5%",
            width: "420px", height: "420px",
            background: "radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)",
            borderRadius: "50%",
            filter: "blur(40px)",
          }}
        />
        {/* Top-right orb */}
        <div
          className="absolute animate-float-slow"
          style={{
            top: "5%", right: "8%",
            width: "360px", height: "360px",
            background: "radial-gradient(circle, rgba(59,130,246,0.16) 0%, transparent 70%)",
            borderRadius: "50%",
            filter: "blur(40px)",
          }}
        />
        {/* Bottom-center orb */}
        <div
          className="absolute animate-float-fast"
          style={{
            bottom: "10%", left: "40%",
            width: "300px", height: "300px",
            background: "radial-gradient(circle, rgba(139,92,246,0.14) 0%, transparent 70%)",
            borderRadius: "50%",
            filter: "blur(50px)",
          }}
        />
      </div>

      {/* ── Hero section ─────────────────────────────────────────────── */}
      <section className="relative mx-auto flex max-w-6xl flex-col items-center px-6 pb-16 pt-28 text-center md:pt-36">

        {/* Logo + wordmark */}
        <div
          className="animate-fade-up mb-8 flex items-center gap-3"
          style={{ opacity: 0 }}
        >
          <div className="relative">
            <div
              className="absolute inset-0 animate-pulse-glow rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(99,102,241,0.5) 0%, transparent 70%)",
                filter: "blur(12px)",
              }}
            />
            <VaulticLogo className="relative h-12 w-12 drop-shadow-lg" />
          </div>
          <span
            className="text-2xl font-bold tracking-widest uppercase"
            style={{
              background: "linear-gradient(135deg, #e0e7ff 0%, #a5b4fc 50%, #818cf8 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              letterSpacing: "0.25em",
            }}
          >
            Vaultic
          </span>
        </div>

        {/* Badge */}
        <div
          className="animate-fade-up delay-100 mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-medium"
          style={{
            opacity: 0,
            borderColor: "rgba(99,102,241,0.35)",
            background: "rgba(99,102,241,0.08)",
            color: "#a5b4fc",
          }}
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" />
          </span>
          Live on Solana Devnet · Alpha
        </div>

        {/* Headline */}
        <h1
          className="animate-fade-up delay-200 text-balance font-bold tracking-tight"
          style={{
            opacity: 0,
            fontSize: "clamp(2.8rem, 7vw, 5.5rem)",
            lineHeight: 1.08,
          }}
        >
          <span
            style={{
              background: "linear-gradient(135deg, #f0f4ff 0%, #c7d2fe 30%, #a78bfa 60%, #60a5fa 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Encrypt.{" "}
          </span>
          <span
            style={{
              background: "linear-gradient(135deg, #a78bfa 0%, #818cf8 40%, #60a5fa 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Control.{" "}
          </span>
          <span
            style={{
              background: "linear-gradient(135deg, #60a5fa 0%, #38bdf8 50%, #67e8f9 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Execute.
          </span>
        </h1>

        {/* Tagline */}
        <p
          className="animate-fade-up delay-300 mt-6 max-w-2xl text-balance text-lg leading-relaxed md:text-xl"
          style={{ opacity: 0, color: "rgba(165,180,252,0.75)" }}
        >
          The privacy-first treasury OS for Solana DAOs — encrypted payroll,
          bridgeless cross-chain execution, and on-chain policy governance.
        </p>

        {/* CTA */}
        <div
          className="animate-fade-up delay-400 mt-10 flex flex-col items-center gap-4"
          style={{ opacity: 0 }}
        >
          <div className="relative group">
            {/* Glow behind button */}
            <div
              className="absolute -inset-1 rounded-xl opacity-60 blur-lg transition-opacity duration-300 group-hover:opacity-100"
              style={{
                background: "linear-gradient(135deg, #6366f1, #4f46e5, #3b82f6)",
              }}
            />
            <div className="relative">
              <WalletButton />
            </div>
          </div>

          {role === "unknown" && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-sm" style={{ color: "rgba(165,180,252,0.6)" }}>
                Wallet connected — no treasury found yet.
              </p>
              <InitializeTreasuryDialog />
            </div>
          )}
        </div>

        {/* Stats bar */}
        <div
          className="animate-fade-up delay-500 mt-16 grid grid-cols-4 gap-px overflow-hidden rounded-2xl"
          style={{
            opacity: 0,
            background: "rgba(99,102,241,0.15)",
            border: "1px solid rgba(99,102,241,0.2)",
          }}
        >
          {STATS.map((stat, i) => (
            <div
              key={stat.label}
              className="flex flex-col items-center px-6 py-4"
              style={{ background: "rgba(5,5,15,0.7)" }}
            >
              <span
                className="text-2xl font-bold md:text-3xl"
                style={{
                  background: i % 2 === 0
                    ? "linear-gradient(135deg, #818cf8, #60a5fa)"
                    : "linear-gradient(135deg, #a78bfa, #818cf8)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {stat.value}
              </span>
              <span className="mt-1 text-xs font-medium uppercase tracking-widest" style={{ color: "rgba(148,163,184,0.7)" }}>
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Feature cards ────────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-6xl px-6 pb-32">
        {/* Section label */}
        <div className="animate-fade-up delay-600 mb-10 text-center" style={{ opacity: 0 }}>
          <p className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: "rgba(99,102,241,0.7)" }}>
            Core Capabilities
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {FEATURES.map((feature, i) => (
            <div
              key={feature.title}
              className={`animate-fade-up group relative overflow-hidden rounded-2xl border transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl ${feature.border} ${feature.glow}`}
              style={{
                opacity: 0,
                animationDelay: `${0.7 + i * 0.1}s`,
                background: "rgba(10,10,20,0.7)",
                borderColor: "rgba(255,255,255,0.06)",
                backdropFilter: "blur(16px)",
              }}
            >
              {/* Card gradient background */}
              <div
                className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 transition-opacity duration-500 group-hover:opacity-100`}
              />

              {/* Top accent line */}
              <div
                className="absolute inset-x-0 top-0 h-px opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                style={{
                  background: "linear-gradient(90deg, transparent, rgba(99,102,241,0.6), transparent)",
                }}
              />

              <div className="relative p-6">
                {/* Icon */}
                <div className={`mb-4 inline-flex rounded-xl p-2.5 ${feature.iconBg}`}>
                  {feature.icon}
                </div>

                {/* Title */}
                <h3 className="mb-2 text-base font-semibold text-white">
                  {feature.title}
                </h3>

                {/* Description */}
                <p className="text-sm leading-relaxed" style={{ color: "rgba(148,163,184,0.8)" }}>
                  {feature.description}
                </p>

                {/* Badge */}
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                  style={{
                    background: "rgba(99,102,241,0.1)",
                    color: "rgba(165,180,252,0.8)",
                    border: "1px solid rgba(99,102,241,0.2)",
                  }}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
                  {feature.badge}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Bottom fade ──────────────────────────────────────────────── */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 inset-x-0 h-32"
        style={{
          background: "linear-gradient(to top, rgba(5,5,15,0.8), transparent)",
        }}
      />
    </main>
  );
}
