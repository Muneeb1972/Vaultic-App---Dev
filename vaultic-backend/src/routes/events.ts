/**
 * Events (SSE) router (Task 20.5).
 *
 * Endpoint:
 *   GET /api/events/treasury/:address    public, SSE stream
 *
 * Per design §3.2.3 footnote this endpoint is intentionally public: the
 * events forwarded here are projections of on-chain program events, which
 * are themselves world-readable via Solana RPC. Requiring wallet-signature
 * auth for a stream of public data would add friction without a security
 * benefit, and signed-request auth is a poor fit for long-lived GETs
 * (EventSource can't attach custom headers reliably in every browser).
 *
 * Two independent policies guard this route:
 *   1. `sseLimiter` (middleware/rateLimit.ts) — 10 connection *attempts*
 *      per IP per minute. Prevents reconnect storms.
 *   2. `SseHub`'s concurrent-connection cap (5 streams per IP) — enforced
 *      inside `register()`. Caps in-flight fan-out fan-in.
 *
 * Paired together they give us aggressive-reconnect resistance (1) and
 * tab-spam resistance (2) without either being load-bearing on its own.
 *
 * The hub is injected via `app.locals.sseHub` — `src/index.ts` creates
 * exactly one instance per process and mounts it there. The handler
 * resolves it per request rather than capturing it in a closure so a
 * test can swap the hub mid-run (e.g. to assert the graceful-shutdown
 * replaces the hub with a no-op stub).
 */
import { Router, type RequestHandler } from 'express';

import { sseLimiter } from '../middleware/rateLimit';
import type { SseHub } from '../services/sse';

/** Shape the handler expects on `app.locals`. */
interface AppLocalsWithSseHub {
  sseHub?: SseHub;
}

/**
 * Minimum shape of the `:address` param. We deliberately don't validate
 * the base58 here — the hub keys by exact-match string and any nonsense
 * address simply produces a stream with zero broadcasts, which is the
 * desired "connected but idle" behaviour. Validating would reject valid
 * addresses if our regex drifts from Solana's canonical rules.
 */
interface AddressParams {
  address: string;
}

/**
 * Handle an SSE subscription. Grabs the hub from `app.locals`, delegates
 * header framing + fan-out bookkeeping to `SseHub.register`, and never
 * returns — the response stays open until the client closes, the TTL
 * expires, or the hub shuts down.
 */
const subscribe: RequestHandler = (req, res) => {
  const locals = req.app.locals as AppLocalsWithSseHub;
  const hub = locals.sseHub;
  if (hub === undefined) {
    // Misconfiguration: `mountRoutes` is expected to populate this.
    // Emitting the JSON error rather than a partial SSE frame keeps
    // the client from interpreting it as an event.
    res.status(503).json({
      error: 'SSE hub not initialised',
      code: 'SSE_UNAVAILABLE',
    });
    return;
  }
  const { address } = req.params as unknown as AddressParams;
  hub.register(address, req, res);
};

/** Build the Events router. */
export function createEventsRouter(): Router {
  const router = Router();
  router.get('/treasury/:address', sseLimiter, subscribe);
  return router;
}
