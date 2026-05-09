/**
 * Anchor + Solana RPC client singletons (Task 19.1).
 *
 * The backend needs exactly one `Connection` and one `Program<Vaultic>` per
 * process. Both are expensive to construct (`Connection` opens a websocket;
 * `Program` walks the full IDL to build namespaces) and safe to share across
 * requests since they hold no per-request state. We cache both in module
 * locals keyed by the `AppConfig` fields that influence them so a test
 * suite calling `loadConfig()` twice with different RPC URLs still gets a
 * fresh client.
 *
 * The `Program<Vaultic>` returned here is built against the placeholder IDL
 * in `src/idl/vaultic.ts`. When the real IDL is copied in from
 * `vaultic-contracts/target/idl/vaultic.json`, the `Vaultic` type alias will
 * tighten from `Idl` to the generated IDL type and every usage in this file
 * becomes statically checked against actual event / account / instruction
 * shapes — see `src/idl/vaultic.ts` for the checklist.
 *
 * Why a read-only provider? The backend never submits transactions; it
 * only reads accounts and listens to logs. `AnchorProvider` requires a
 * `Wallet`, so we hand it Anchor's stock `Wallet` wrapper around a
 * throwaway keypair. The keypair exists purely so `provider.publicKey`
 * is a valid 32-byte Ed25519 key in logs; nothing in this process signs
 * with it, and any accidental signing attempt would go out with a key
 * no on-chain account authorises.
 */
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import { Connection, Keypair } from '@solana/web3.js';

import { IDL, type Vaultic } from '../idl/vaultic';
import type { AppConfig } from '../config';

/**
 * Minimum config fields required to construct an Anchor program. Accepting
 * this subset lets tests build a config literal without populating every
 * unrelated env var (`FRONTEND_ORIGIN`, `IKA_GRPC_URL`, …).
 */
export type AnchorClientConfig = Pick<
  AppConfig,
  'solanaRpcUrl' | 'vaulticProgramId'
>;

/** Narrow the singleton cache key to just the fields it depends on. */
interface CacheEntry {
  readonly solanaRpcUrl: string;
  readonly vaulticProgramId: string;
  readonly connection: Connection;
  readonly program: Program<Vaultic>;
}

let cached: CacheEntry | null = null;

/**
 * Build a read-only wallet. The backend never submits transactions —
 * it only reads accounts and listens to logs — but `AnchorProvider`
 * still requires a `Wallet`, so we hand it Anchor's `Wallet` wrapper
 * around a throwaway keypair. The keypair exists purely so
 * `provider.publicKey` is a valid 32-byte Ed25519 key in logs; nothing
 * in this process signs with it.
 *
 * We wrap Anchor's `Wallet` class rather than implement the interface
 * directly because Anchor 0.31's public export is the NodeWallet class
 * (with a required `payer: Keypair` field), not the underlying
 * interface. Matching the class keeps us out of internal imports.
 */
function buildReadOnlyWallet(): Wallet {
  return new Wallet(Keypair.generate());
}

/**
 * Build (or retrieve) the shared `Connection` for the configured Solana RPC
 * endpoint. Commitment is pinned to `confirmed` because event-listening
 * latency matters more than bullet-proof finality for UI projections; the
 * underlying on-chain state is re-fetched at `confirmed` level by downstream
 * PDA reads (design §3.2.5).
 */
export function getConnection(config: AnchorClientConfig): Connection {
  if (
    cached !== null &&
    cached.solanaRpcUrl === config.solanaRpcUrl &&
    cached.vaulticProgramId === config.vaulticProgramId
  ) {
    return cached.connection;
  }
  // No cache hit — rebuild both connection and program together so the
  // two always share a provider.
  return buildCacheEntry(config).connection;
}

/**
 * Build (or retrieve) the shared `Program<Vaultic>` bound to the configured
 * program id and RPC endpoint. The returned instance is safe to use
 * concurrently; Anchor's internal `EventManager` handles subscription
 * bookkeeping, and the account/methods namespaces are idempotent.
 */
export function getAnchorProgram(
  config: AnchorClientConfig,
): Program<Vaultic> {
  if (
    cached !== null &&
    cached.solanaRpcUrl === config.solanaRpcUrl &&
    cached.vaulticProgramId === config.vaulticProgramId
  ) {
    return cached.program;
  }
  return buildCacheEntry(config).program;
}

/**
 * Internal factory — constructs a fresh `Connection` + `Program` pair,
 * replaces the module-level cache, and returns the new entry. Kept
 * private so callers can't accidentally bypass the cache.
 */
function buildCacheEntry(config: AnchorClientConfig): CacheEntry {
  const connection = new Connection(config.solanaRpcUrl, {
    commitment: 'confirmed',
  });

  const wallet = buildReadOnlyWallet();
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
  });

  // The real IDL type from Anchor's codegen narrows `address` to the literal
  // program id string `"5igWLTbdAjGfAZKsK9G3Buhe7mkrgC3GEYkQaD4PrTnZ"`, so we
  // can't spread `address: config.vaulticProgramId` (that's a widened `string`).
  // For devnet this is fine — `config.vaulticProgramId` should equal the hard-
  // coded literal. If a future deploy changes the program id, re-run `anchor
  // build` and re-vendor the IDL; the `Vaultic` type will update automatically.
  // The runtime cast to `any` before `Program` construction lets us keep the
  // env-var plumbing intact for multi-cluster support without loosening the
  // IDL type on disk.
  const idlForProgram = { ...(IDL as object), address: config.vaulticProgramId };

  const program = new Program<Vaultic>(idlForProgram as Vaultic, provider);

  const entry: CacheEntry = {
    solanaRpcUrl: config.solanaRpcUrl,
    vaulticProgramId: config.vaulticProgramId,
    connection,
    program,
  };
  cached = entry;
  return entry;
}

/**
 * Drop the cached singleton. Used by tests between cases so each assertion
 * sees a fresh provider; production code never calls this.
 */
export function __resetAnchorClientCacheForTests(): void {
  cached = null;
}
