/**
 * Rate-limit middlewares (Task 18.2, Req 29.1).
 *
 * Two pre-built limiters keyed by client IP:
 *   • `readLimiter`  — 100 requests / minute, mounted on GET routes.
 *   • `writeLimiter` —  20 requests / minute, mounted on mutating routes
 *                       (POST, PUT, DELETE).
 *
 * Route groups choose which to mount in `src/index.ts` / individual
 * routers (Task 20).
 */
import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

/** One minute, in milliseconds. */
const WINDOW_MS = 60_000;

/** IP-based key generator. Falls back to 'unknown' when `req.ip` is absent. */
const keyGenerator = (req: Request): string => req.ip ?? 'unknown';

/** Body returned when a limit is exceeded (aligns with global error shape). */
const buildLimitPayload = (limit: number) => ({
  error: 'Too many requests',
  code: 'RATE_LIMIT_EXCEEDED',
  details: { limit, windowMs: WINDOW_MS },
});

/** 100 requests per minute per IP — applied to GET endpoints. */
export const readLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator,
  message: buildLimitPayload(100),
});

/** 20 requests per minute per IP — applied to POST / PUT / DELETE endpoints. */
export const writeLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator,
  message: buildLimitPayload(20),
});

/**
 * 10 connection attempts per minute per IP — applied to the SSE
 * endpoint (Task 20.5, design §3.2.4 SSE rate limiter block).
 *
 * This limiter controls how often a client may *open* a stream, not how
 * many concurrent streams it holds — the concurrent-connection cap
 * lives inside `SseHub` (5 streams per IP). Pairing both keeps
 * aggressive reconnect loops from starving the hub while still letting
 * a user reload their dashboard a few times per minute.
 */
export const sseLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator,
  message: buildLimitPayload(10),
});
