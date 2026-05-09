/**
 * Display formatters shared across the dashboard and portal (Task 26).
 *
 * Kept framework-agnostic — these helpers don't touch React, so they can
 * be reused in Playwright tests, Node scripts, or anywhere else. All
 * functions are safe to call with `null` / `undefined` inputs and will
 * return a visible placeholder rather than throwing.
 */
import { BN } from "@coral-xyz/anchor";
import { LAMPORTS_PER_SOL, type PublicKey } from "@solana/web3.js";

/**
 * Format a `BN` / bigint / number of lamports as a short SOL string.
 *
 * We divide by `LAMPORTS_PER_SOL` (1e9) and show at most 4 decimal places
 * — enough to distinguish small amounts without drowning the UI in
 * trailing zeros. The `toFixed(4).replace(/0+$/, '')` tail trims unused
 * precision so `1.5000 SOL` renders as `1.5 SOL`.
 */
export function formatLamportsSol(
  lamports: BN | bigint | number | null | undefined,
): string {
  if (lamports === null || lamports === undefined) return "—";

  let asNumber: number;
  if (typeof lamports === "number") {
    asNumber = lamports;
  } else if (typeof lamports === "bigint") {
    asNumber = Number(lamports);
  } else {
    // Anchor BN — guard against huge values that would overflow `toNumber()`.
    try {
      asNumber = lamports.toNumber();
    } catch {
      // Fall back to bigint via string for values > 2^53.
      asNumber = Number(BigInt(lamports.toString()));
    }
  }

  const sol = asNumber / LAMPORTS_PER_SOL;
  const trimmed = sol
    .toFixed(4)
    .replace(/\.?0+$/, "");
  return `${trimmed || "0"} SOL`;
}

/**
 * Shorten a base58-encoded key / address to `head...tail`.
 *
 * Accepts a `PublicKey` or a raw base58 string. Short enough to sit in a
 * table cell; not so short that collisions are likely at a glance. The
 * default `length = 4` matches the convention used elsewhere in the app
 * (`5igW...rTnZ`).
 */
export function shortenAddress(
  key: PublicKey | string | null | undefined,
  length = 4,
): string {
  if (!key) return "—";
  const str = typeof key === "string" ? key : key.toBase58();
  if (str.length <= length * 2 + 3) return str;
  return `${str.slice(0, length)}...${str.slice(-length)}`;
}

/**
 * Format a unix timestamp (seconds, as a `BN` / number) as a locale date.
 *
 * Returns `"Never"` for the sentinel `0` because the on-chain code uses
 * `last_payroll_timestamp = 0` to mean "no payroll has run yet" (Req 14.2).
 */
export function formatUnixTimestamp(
  ts: BN | bigint | number | null | undefined,
): string {
  if (ts === null || ts === undefined) return "—";

  let secs: number;
  if (typeof ts === "number") {
    secs = ts;
  } else if (typeof ts === "bigint") {
    secs = Number(ts);
  } else {
    try {
      secs = ts.toNumber();
    } catch {
      secs = Number(BigInt(ts.toString()));
    }
  }

  if (secs === 0) return "Never";

  const date = new Date(secs * 1000);
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Format a countdown in seconds as a compact `2h 34m` / `45s` string.
 *
 * Used by `ExecutePayrollButton` to tell the admin how long until the
 * payroll interval has elapsed.
 */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) {
    const remS = s % 60;
    return remS === 0 ? `${m}m` : `${m}m ${remS}s`;
  }
  const h = Math.floor(m / 60);
  const remM = m % 60;
  if (h < 24) {
    return remM === 0 ? `${h}h` : `${h}h ${remM}m`;
  }
  const d = Math.floor(h / 24);
  const remH = h % 24;
  return remH === 0 ? `${d}d` : `${d}d ${remH}h`;
}

/**
 * Vesting completion percentage given `vestingStart`, `vestingDuration`,
 * and the current unix time.
 *
 * Clamped to `[0, 100]`. Returns `0` when the start is in the future and
 * `100` once the full duration has elapsed.
 */
export function vestingProgressPct(
  vestingStart: BN | number,
  vestingDuration: BN | number,
  nowSecs: number = Math.floor(Date.now() / 1000),
): number {
  const start =
    typeof vestingStart === "number" ? vestingStart : vestingStart.toNumber();
  const duration =
    typeof vestingDuration === "number"
      ? vestingDuration
      : vestingDuration.toNumber();

  if (duration <= 0) return 100;
  const elapsed = nowSecs - start;
  if (elapsed <= 0) return 0;
  if (elapsed >= duration) return 100;
  return Math.round((elapsed / duration) * 100);
}

/** Role tier labels indexed by the on-chain `role_id` (Req 2.7). */
export const ROLE_LABELS = [
  "Junior",
  "Mid",
  "Senior",
  "Lead",
  "Executive",
] as const;

/** Chain preference labels indexed by the on-chain `chain_preference`. */
export const CHAIN_LABELS = ["Solana", "Ethereum", "Bitcoin"] as const;

/** dWallet curve type labels per design §3.1.2 (0..=3). */
export const CURVE_LABELS = [
  "Secp256k1",
  "Ed25519",
  "Ristretto25519",
  "Unbound",
] as const;

/** Return the human-readable role name or `Role N` for out-of-range ids. */
export function roleLabel(roleId: number): string {
  return ROLE_LABELS[roleId] ?? `Role ${roleId}`;
}

/** Return the human-readable chain name or `Chain N` for out-of-range ids. */
export function chainLabel(chainId: number): string {
  return CHAIN_LABELS[chainId] ?? `Chain ${chainId}`;
}

/** Return the human-readable dWallet curve name. */
export function curveLabel(curveId: number): string {
  return CURVE_LABELS[curveId] ?? `Curve ${curveId}`;
}

/**
 * Solana explorer URL for a transaction signature. Devnet-only for now;
 * the cluster query-string argument is controlled by the `NEXT_PUBLIC_CLUSTER`
 * env var with a `devnet` default so local dev points at the right cluster.
 */
export function explorerTxUrl(signature: string): string {
  const cluster = process.env.NEXT_PUBLIC_CLUSTER ?? "devnet";
  return `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
}

/**
 * Decode a hex string (with or without `0x` prefix) to a `Uint8Array`.
 * Throws `Error("Invalid hex")` on odd length or non-hex characters so
 * form validation can catch the failure early.
 */
export function hexToBytes(hex: string): Uint8Array {
  const normalised = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]*$/.test(normalised) || normalised.length % 2 !== 0) {
    throw new Error("Invalid hex");
  }
  const out = new Uint8Array(normalised.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(normalised.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Pad a byte array out to `length` bytes by appending zero bytes. The
 * contracts expect a fixed-size `[u8; 64]` `target_address` regardless
 * of which chain the employee chose.
 */
export function padBytes(bytes: Uint8Array, length: number): Uint8Array {
  if (bytes.length > length) {
    throw new Error(`bytes exceed max length ${length}`);
  }
  const out = new Uint8Array(length);
  out.set(bytes);
  return out;
}
