/**
 * signedFetch — client-side helper for calling the authenticated backend
 * endpoints (Task 26.2).
 *
 * Mirrors the middleware contract in `vaultic-backend/src/middleware/auth.ts`
 * and the canonicalisation routine in `vaultic-backend/src/utils/signature.ts`:
 *
 *     message = `${METHOD}\n${PATH}\n${JSON.stringify(body)}\n${timestamp}`
 *
 * which is signed as Ed25519 bytes via `wallet.signMessage(...)` (the
 * standard wallet-adapter hook). Headers:
 *
 *   - X-Wallet-Address   — base58 pubkey
 *   - X-Wallet-Signature — base58 signature
 *   - X-Wallet-Timestamp — Unix epoch ms (string)
 *
 * The timestamp must land inside the backend's 60s replay window, so we
 * compute it inside this function rather than accepting it from callers.
 */
import { utils as anchorUtils } from "@coral-xyz/anchor";
import type { WalletContextState } from "@solana/wallet-adapter-react";

/** Signature contract the wallet-adapter exposes for message signing. */
export interface MessageSigner {
  publicKey: { toBase58: () => string };
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
}

export type SignedFetchMethod = "POST" | "PUT" | "PATCH" | "DELETE";

export interface SignedFetchOptions {
  /** Backend base URL. Defaults to `NEXT_PUBLIC_BACKEND_URL` env var. */
  baseUrl?: string;
  /** Optional AbortSignal for cancellation. */
  signal?: AbortSignal;
}

/**
 * Perform a wallet-signed mutation against the Vaultic backend.
 *
 * The connected wallet object is expected to expose `publicKey` and
 * `signMessage`. Wallets that don't support `signMessage` (rare, but the
 * type allows it) will throw — we can't fall back to transaction signing
 * for a REST call.
 *
 * Errors are surfaced as thrown `Error` instances with the backend's
 * `code` attached when available so callers can dispatch on the shape.
 *
 * @param wallet - connected wallet-adapter state or minimal signer shape
 * @param method - HTTP method (POST/PUT/PATCH/DELETE)
 * @param path   - absolute path starting with `/api/...` — the backend
 *                 canonicalises against `req.originalUrl` (the request path
 *                 without query string), so we sign the same string.
 * @param body   - JSON-serialisable payload; `{}` if the endpoint has no body
 * @param options - optional base URL override and AbortSignal
 */
export async function signedFetch<TResponse>(
  wallet: WalletContextState | MessageSigner,
  method: SignedFetchMethod,
  path: string,
  body: unknown,
  options: SignedFetchOptions = {},
): Promise<TResponse> {
  if (!wallet.publicKey) {
    throw new Error("Wallet is not connected");
  }
  if (typeof wallet.signMessage !== "function") {
    throw new Error("Wallet does not support message signing");
  }

  const baseUrl =
    options.baseUrl ??
    process.env.NEXT_PUBLIC_BACKEND_URL ??
    "http://localhost:3000";
  const timestamp = Date.now().toString();
  const bodyJson = JSON.stringify(body ?? {});
  const message = `${method}\n${path}\n${bodyJson}\n${timestamp}`;
  const messageBytes = new TextEncoder().encode(message);

  const signatureBytes = await wallet.signMessage(messageBytes);
  const signature = anchorUtils.bytes.bs58.encode(Buffer.from(signatureBytes));

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Wallet-Address": wallet.publicKey.toBase58(),
      "X-Wallet-Signature": signature,
      "X-Wallet-Timestamp": timestamp,
    },
    body: bodyJson,
    signal: options.signal,
  });

  if (!response.ok) {
    let errorBody: { error?: string; code?: string } = {};
    try {
      errorBody = (await response.json()) as typeof errorBody;
    } catch {
      // Leave errorBody as {} — the backend should always JSON-respond,
      // but an upstream proxy might return HTML.
    }
    const err = new Error(
      errorBody.error ?? `Backend request failed (${response.status})`,
    ) as Error & { code?: string; status?: number };
    err.code = errorBody.code;
    err.status = response.status;
    throw err;
  }

  return (await response.json()) as TResponse;
}
