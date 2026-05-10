/**
 * DevnetBanner — slim sticky bar reminding users that devnet data is
 * ephemeral (Task 23.2, Req 30.7).
 *
 * Renders only when `NEXT_PUBLIC_CLUSTER === 'devnet'` so the component
 * disappears once the app points at mainnet or localnet. It's a server
 * component — no interactivity, no hooks — which keeps the initial HTML
 * payload small and avoids hydration cost.
 *
 * Styling choices:
 *   - Amber on near-black background: the shadcn theme is dark only, so we
 *     use amber-400 text on zinc-950 to match the "warning" affordance
 *     without introducing new theme tokens.
 *   - Sticky top with high z-index so it stays visible under fixed topbars
 *     and behind modal backdrops.
 *   - `py-2 text-xs text-center` — spec calls for "slim horizontal bar";
 *     keeps vertical real estate minimal.
 */

export function DevnetBanner() {
  if (process.env.NEXT_PUBLIC_CLUSTER !== "devnet") {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 w-full py-2 text-center text-xs font-medium tracking-widest"
      style={{
        background: "linear-gradient(90deg, rgba(99,102,241,0.12) 0%, rgba(59,130,246,0.12) 50%, rgba(99,102,241,0.12) 100%)",
        borderBottom: "1px solid rgba(99,102,241,0.2)",
        color: "rgba(165,180,252,0.85)",
      }}
    >
      <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-violet-400 align-middle" style={{ boxShadow: "0 0 6px rgba(167,139,250,0.8)" }} />
      DEVNET — data will be reset at Alpha 1 transition
      <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-blue-400 align-middle" style={{ boxShadow: "0 0 6px rgba(96,165,250,0.8)" }} />
    </div>
  );
}
