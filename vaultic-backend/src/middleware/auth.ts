/**
 * Wallet-signature auth middleware (Task 18.3, Req 11).
 *
 * Verifies the trio of headers on every mutating request:
 *   • `X-Wallet-Address`   — base58 Ed25519 public key (32 bytes)
 *   • `X-Wallet-Signature` — base58 Ed25519 signature (64 bytes)
 *   • `X-Wallet-Timestamp` — Unix epoch ms as a decimal string
 *
 * Signed payload is the canonical `${METHOD}\n${PATH}\n${BODY_JSON}\n${TS}`
 * string. Timestamps older than 60 s (or in the future by 60 s) are
 * rejected as replays (Req 11.4–11.5). On success the verified wallet
 * is attached to `req.user`; on any failure the middleware responds
 * with a 401 whose code identifies the precise failure mode.
 *
 * The middleware is a factory so routers can mount it selectively —
 * public GET endpoints bypass it (Req 11.5).
 */
import type { Request, RequestHandler, Response } from 'express';
import {
  SignatureFailureCode,
  verifyWalletSignature,
} from '../utils/signature';

/** Header names the frontend must send on mutating requests. */
const HEADER_WALLET = 'x-wallet-address';
const HEADER_SIGNATURE = 'x-wallet-signature';
const HEADER_TIMESTAMP = 'x-wallet-timestamp';

/** Shape of the 401 body returned on auth failure. */
export interface AuthErrorBody {
  error: 'Unauthorized';
  code: AuthErrorCode;
}

/** Distinct auth-failure codes surfaced to the client. */
export type AuthErrorCode =
  | 'MISSING_HEADERS'
  | 'INVALID_SIGNATURE'
  | 'STALE_TIMESTAMP';

/** Read a single header value as a string, rejecting array forms. */
function readHeader(req: Request, name: string): string | undefined {
  const raw = req.headers[name];
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'string') {
    return raw[0];
  }
  return undefined;
}

/** Map the lower-level signature verifier codes onto the public 401 codes. */
function mapFailureCode(code: SignatureFailureCode): AuthErrorCode {
  return code === 'STALE_TIMESTAMP' ? 'STALE_TIMESTAMP' : 'INVALID_SIGNATURE';
}

/** Build and send the canonical 401 response body. */
function reject(res: Response, code: AuthErrorCode): void {
  const body: AuthErrorBody = { error: 'Unauthorized', code };
  res.status(401).json(body);
}

/**
 * Verifies wallet-signed requests. Mount on every mutating router group
 * (POST, PUT, DELETE); leave GET routers unwrapped so Req 11.5's public
 * read access still holds.
 */
export const authMiddleware: RequestHandler = (req, res, next) => {
  const walletAddress = readHeader(req, HEADER_WALLET);
  const signature = readHeader(req, HEADER_SIGNATURE);
  const timestamp = readHeader(req, HEADER_TIMESTAMP);

  if (!walletAddress || !signature || !timestamp) {
    reject(res, 'MISSING_HEADERS');
    return;
  }

  // `req.path` is stripped of the mount prefix; `originalUrl` preserves
  // the full path as the client sent it. Strip the query string so the
  // signed message matches what the client canonicalised.
  const path = req.originalUrl.split('?')[0] ?? req.originalUrl;

  const result = verifyWalletSignature({
    walletAddress,
    signature,
    timestamp,
    request: {
      method: req.method,
      path,
      body: req.body,
    },
  });

  if (!result.ok) {
    reject(res, mapFailureCode(result.code));
    return;
  }

  req.user = { walletAddress };
  next();
};
