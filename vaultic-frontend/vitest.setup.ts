/**
 * Global test setup (Task 29.1).
 *
 * - Extends Vitest's expect with `@testing-library/jest-dom` matchers
 *   (`toBeInTheDocument`, `toBeDisabled`, etc.).
 * - Stubs `sonner` so `toast.*` calls don't attempt portal rendering in
 *   jsdom; individual tests can spy on these if they need to.
 * - Stubs `next/navigation` so any component that indirectly pulls in
 *   `useRouter` / `usePathname` during rendering doesn't crash — these
 *   hooks throw outside a Next runtime.
 * - Pins the env vars consumed by `lib/format.ts` and `lib/anchor.ts` so
 *   explorer URLs and program-id resolution are deterministic.
 */
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

process.env.NEXT_PUBLIC_CLUSTER = "devnet";
process.env.NEXT_PUBLIC_VAULTIC_PROGRAM_ID =
  "5igWLTbdAjGfAZKsK9G3Buhe7mkrgC3GEYkQaD4PrTnZ";
process.env.NEXT_PUBLIC_BACKEND_URL = "http://localhost:3000";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    message: vi.fn(),
  },
  Toaster: () => null,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
