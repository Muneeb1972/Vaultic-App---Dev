/**
 * Landing page `/` (Task 25, Req 13.1–13.4).
 *
 * Kept as a server component so the initial HTML stays cheap — the
 * wallet-adapter runtime and the role-detection `useQuery` only mount
 * inside the `<LandingHero />` client boundary below. That split means
 * search engines and link previews still get a server-rendered "Encrypt.
 * Control. Execute." headline even if JS fails to load.
 *
 * All visual chrome lives in `LandingHero` — the gradient, wordmark,
 * tagline, wallet CTA, and feature cards. This file exists mainly to keep
 * the server/client boundary explicit at the route root.
 */
import { LandingHero } from "@/components/landing/LandingHero";

export default function Home() {
  return <LandingHero />;
}
