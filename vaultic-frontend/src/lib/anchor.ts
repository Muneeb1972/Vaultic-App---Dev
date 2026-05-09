/**
 * Anchor `Program<Vaultic>` factory for the frontend (Task 23.3).
 *
 * Mirrors the backend pattern in `vaultic-backend/src/services/anchorClient.ts`:
 *   - Build an `AnchorProvider` from a `Connection` + wallet
 *   - Override the IDL's embedded `address` field with the env var so we can
 *     redeploy to a new program id without re-vendoring the IDL
 *   - Construct and return `new Program<Vaultic>(idl, provider)`
 *
 * Two shapes are exported:
 *   - `createVaulticProgram(connection, wallet)` — pure factory used anywhere
 *     a caller already has a connection + wallet (e.g. tests, scripts, or
 *     non-hook contexts).
 *   - `useVaulticProgram()` — React hook that pulls `useConnection()` and
 *     `useAnchorWallet()` from the wallet adapter. Returns `null` until the
 *     user connects a wallet, memoised on the `(connection, wallet)` pair so
 *     downstream `useQuery` / `useMutation` keys stay stable.
 *
 * `useAnchorWallet()` (distinct from `useWallet()`) returns `undefined` when
 * the wallet is not connected AND exposes `signTransaction` / `signAllTransactions`
 * as required by `AnchorProvider`. That's why the hook uses it rather than
 * `useWallet()` directly.
 */
import {
  AnchorProvider,
  Program,
  type Idl,
} from "@coral-xyz/anchor";
import {
  useAnchorWallet,
  useConnection,
} from "@solana/wallet-adapter-react";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import { type Connection } from "@solana/web3.js";
import { useMemo } from "react";

import { IDL, VAULTIC_PROGRAM_ADDRESS, type Vaultic } from "./idl";

/**
 * Resolve the program id for the currently-configured cluster. Falls back to
 * the devnet literal from the IDL if `NEXT_PUBLIC_VAULTIC_PROGRAM_ID` is
 * missing so local dev doesn't crash before `.env.local` is populated.
 */
function resolveProgramId(): string {
  return (
    process.env.NEXT_PUBLIC_VAULTIC_PROGRAM_ID ?? VAULTIC_PROGRAM_ADDRESS
  );
}

/**
 * Construct a fresh `Program<Vaultic>` instance bound to the given connection
 * and wallet. Callers are responsible for caching; this function has no
 * internal memoisation on purpose so the hook version can control re-creation
 * via `useMemo` and tests can build isolated instances.
 *
 * The IDL spread + `address` override matches `anchorClient.ts` — the
 * generated `Vaultic` type narrows `address` to the literal program id string,
 * so we can't just assign `config.vaulticProgramId` as-is (that widens to
 * `string`). We launder through `object` before casting back to `Vaultic`,
 * which preserves the Anchor runtime contract while letting the env var
 * drive multi-cluster deploys.
 */
export function createVaulticProgram(
  connection: Connection,
  wallet: AnchorWallet,
): Program<Vaultic> {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });

  const idlForProgram = {
    ...(IDL as object),
    address: resolveProgramId(),
  } as Vaultic;

  return new Program<Vaultic>(idlForProgram as Idl as Vaultic, provider);
}

/**
 * React hook wrapping {@link createVaulticProgram} for component use.
 *
 * Returns `null` when no wallet is connected — callers should skip on-chain
 * reads/writes in that state rather than throwing. The memo key is
 * `(connection, wallet)` so the Program instance is stable as long as the
 * user's wallet connection is stable; any change (wallet swap, RPC reload)
 * rebuilds the provider cleanly.
 */
export function useVaulticProgram(): Program<Vaultic> | null {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  return useMemo(() => {
    if (!wallet) {
      return null;
    }
    return createVaulticProgram(connection, wallet);
  }, [connection, wallet]);
}
