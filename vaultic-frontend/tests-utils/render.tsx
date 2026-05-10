/**
 * Test render helper (Task 29.1).
 *
 * Wraps components under test with the providers they need at runtime:
 *   - `QueryClientProvider` — the form components all use `useMutation`
 *     and `useQueryClient`, which require a client in the tree. Disabling
 *     retries keeps failed mutations deterministic inside tests.
 *
 * The wallet adapter context is intentionally NOT wired up here because
 * every test file mocks `@solana/wallet-adapter-react` and `@/lib/anchor`
 * directly — rendering a real `WalletProvider` would pull in browser-only
 * dependencies that jsdom cannot host.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return {
    ...render(ui, { wrapper: Wrapper, ...options }),
    queryClient,
  };
}
