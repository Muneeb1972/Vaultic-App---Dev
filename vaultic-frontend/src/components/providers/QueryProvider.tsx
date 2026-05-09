"use client";

/**
 * QueryProvider — TanStack Query client wired with the project-wide defaults
 * (Task 23.1, design §3.3.3 "TanStack Query with 30s staleTime").
 *
 * Lives in its own client component so `app/layout.tsx` can remain a server
 * component. `QueryClient` is created lazily inside `useState` so the same
 * instance survives across re-renders of this provider; instantiating it at
 * the module level would share the cache across every user in SSR (bad),
 * and instantiating inside the component body would re-key every query on
 * each render (also bad).
 *
 * `staleTime: 30_000` matches design §3.3.3 — treasury / employee / payroll
 * reads are projections of on-chain state and don't need aggressive
 * refetching; the 30-second window smooths network traffic without lagging
 * meaningful UI updates (SSE pushes any post-transaction changes anyway).
 */
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export interface QueryProviderProps {
  children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}
