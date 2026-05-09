/**
 * CORS middleware (Task 18.1, Req 29.2).
 *
 * Allowlists a single origin — `FRONTEND_ORIGIN` from env — and permits
 * only the headers the wallet-signature auth flow actually uses. Any
 * additional origin is rejected by the upstream `cors` package before
 * the request reaches our route handlers.
 */
import cors from 'cors';
import type { RequestHandler } from 'express';
import type { AppConfig } from '../config';

/** Headers the frontend must be allowed to send for signed requests. */
const ALLOWED_HEADERS = [
  'Content-Type',
  'X-Wallet-Address',
  'X-Wallet-Signature',
  'X-Wallet-Timestamp',
];

/** Methods exposed to the browser. Mirrors the REST surface (Req 10–12). */
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];

/**
 * Build a CORS middleware locked to the configured frontend origin.
 *
 * Credentials are enabled so the browser forwards the authenticated
 * headers across origins; `origin` is passed as a single string (not an
 * array) to guarantee the reflected `Access-Control-Allow-Origin` value
 * is exactly what was configured — no dynamic reflection of the caller.
 */
export function corsMiddleware(config: AppConfig): RequestHandler {
  return cors({
    origin: config.frontendOrigin,
    credentials: true,
    allowedHeaders: ALLOWED_HEADERS,
    methods: ALLOWED_METHODS,
  });
}
