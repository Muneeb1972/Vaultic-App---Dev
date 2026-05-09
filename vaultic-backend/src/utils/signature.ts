/**
 * Wallet-signature verification helper (Task 18.3, Req 11).
 *
 * Encapsulates the canonicalisation + `nacl.sign.detached.verify` check
 * used by the auth middleware so the same routine can be exercised by
 * unit and property-based tests (Task 21) without spinning up Express.
 *
 * Canonical message format (must match the frontend signer):
 *
 *     `${METHOD}\n${PATH}\n${BODY_JSON}\n${TIMESTAMP}`
 *
 * where `BODY_JSON` is `JSON.stringify(req.body)` — the object that
 * `express.json()` produced, NOT the raw byte stream — and `PATH` is the
 * request path without its query string. Both sides MUST produce bytes
 * via `new TextEncoder().encode(message)` (UTF-8).
 */
import bs58 from 'bs58';
import nacl from 'tweetnacl';

/** Width of an Ed25519 public key, in bytes. */
export const ED25519_PUBKEY_BYTES = 32;
/** Width of an Ed25519 signature, in bytes. */
export const ED25519_SIGNATURE_BYTES = 64;
/** Maximum allowed clock skew between client and server (ms). */
export const SIGNATURE_TIMESTAMP_WINDOW_MS = 60_000;

/** Inputs required to build the canonical signed payload. */
export interface CanonicalRequest {
  /** HTTP method, upper-cased (`POST`, `PUT`, `DELETE`). */
  method: string;
  /** Request path WITHOUT query string. */
  path: string;
  /** Parsed JSON body (as produced by `express.json()`). */
  body: unknown;
  /** Unix epoch milliseconds as a string (must match the `X-Wallet-Timestamp` header). */
  timestamp: string;
}

/**
 * Build the deterministic message string the client must have signed.
 *
 * `JSON.stringify` is relied on for body canonicalisation so the client
 * and server agree on the exact byte sequence; callers are responsible
 * for serialising their request bodies with the same routine.
 */
export function buildCanonicalMessage(req: CanonicalRequest): string {
  const bodyJson = JSON.stringify(req.body ?? {});
  return `${req.method.toUpperCase()}\n${req.path}\n${bodyJson}\n${req.timestamp}`;
}

/** Why a signature verification rejected a request. */
export type SignatureFailureCode =
  | 'INVALID_PUBKEY'
  | 'INVALID_SIGNATURE_ENCODING'
  | 'INVALID_SIGNATURE'
  | 'STALE_TIMESTAMP';

/** Structured result returned by {@link verifyWalletSignature}. */
export type SignatureVerification =
  | { ok: true }
  | { ok: false; code: SignatureFailureCode; reason: string };

/** Inputs needed to verify a wallet signature. */
export interface VerifyWalletSignatureInput {
  /** Base58-encoded Ed25519 wallet public key (header `X-Wallet-Address`). */
  walletAddress: string;
  /** Base58-encoded Ed25519 signature (header `X-Wallet-Signature`). */
  signature: string;
  /** Unix epoch ms as string (header `X-Wallet-Timestamp`). */
  timestamp: string;
  /** Canonicalised request used to rebuild the signed message. */
  request: Omit<CanonicalRequest, 'timestamp'>;
  /**
   * Override for the current time (ms since epoch). Injected in tests;
   * production callers should omit this and let it default to `Date.now()`.
   */
  now?: () => number;
}

/**
 * Verify that `signature` was produced by `walletAddress` over the
 * canonical payload for `request`, and that `timestamp` falls within
 * {@link SIGNATURE_TIMESTAMP_WINDOW_MS} of the current clock.
 *
 * Returns a discriminated result rather than throwing so the caller can
 * map the failure code onto a 401 response body (Req 11.3–11.5).
 */
export function verifyWalletSignature(
  input: VerifyWalletSignatureInput,
): SignatureVerification {
  const tsNumber = Number.parseInt(input.timestamp, 10);
  if (!Number.isFinite(tsNumber)) {
    return {
      ok: false,
      code: 'STALE_TIMESTAMP',
      reason: 'timestamp is not a valid integer',
    };
  }

  const now = (input.now ?? Date.now)();
  if (Math.abs(now - tsNumber) >= SIGNATURE_TIMESTAMP_WINDOW_MS) {
    return {
      ok: false,
      code: 'STALE_TIMESTAMP',
      reason: `timestamp outside ${SIGNATURE_TIMESTAMP_WINDOW_MS}ms window`,
    };
  }

  let pubkeyBytes: Uint8Array;
  try {
    pubkeyBytes = bs58.decode(input.walletAddress);
  } catch {
    return {
      ok: false,
      code: 'INVALID_PUBKEY',
      reason: 'wallet address is not valid base58',
    };
  }
  if (pubkeyBytes.length !== ED25519_PUBKEY_BYTES) {
    return {
      ok: false,
      code: 'INVALID_PUBKEY',
      reason: `wallet address must decode to ${ED25519_PUBKEY_BYTES} bytes`,
    };
  }

  let signatureBytes: Uint8Array;
  try {
    signatureBytes = bs58.decode(input.signature);
  } catch {
    return {
      ok: false,
      code: 'INVALID_SIGNATURE_ENCODING',
      reason: 'signature is not valid base58',
    };
  }
  if (signatureBytes.length !== ED25519_SIGNATURE_BYTES) {
    return {
      ok: false,
      code: 'INVALID_SIGNATURE_ENCODING',
      reason: `signature must decode to ${ED25519_SIGNATURE_BYTES} bytes`,
    };
  }

  const message = buildCanonicalMessage({
    ...input.request,
    timestamp: input.timestamp,
  });
  const messageBytes = new TextEncoder().encode(message);

  const valid = nacl.sign.detached.verify(
    messageBytes,
    signatureBytes,
    pubkeyBytes,
  );
  if (!valid) {
    return {
      ok: false,
      code: 'INVALID_SIGNATURE',
      reason: 'nacl signature verification failed',
    };
  }

  return { ok: true };
}
