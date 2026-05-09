/**
 * Vaultic backend — Express bootstrap (Task 18.5).
 *
 * Wires the canonical middleware stack defined in design §3.2 and
 * Requirements 29.4–29.5:
 *
 *   trust-proxy (prod) → HTTPS redirect (prod) → helmet → cors
 *     → express.json → /health → routers → 404 → error formatter
 *
 * Rate limiters, wallet-signature auth, and Zod validators are mounted
 * per-router (Task 20) rather than globally, so public GET endpoints
 * can bypass auth (Req 11.5) and read-heavy routes get the 100/min
 * limiter instead of the 20/min write limiter.
 */
import 'dotenv/config';

import express, {
  type ErrorRequestHandler,
  type RequestHandler,
} from 'express';
import helmet from 'helmet';

import { loadConfig, type AppConfig } from './config';
import { corsMiddleware } from './middleware/cors';
import { mountRoutes } from './routes';
import { IkaPoller, SseHub, VaulticEventListener } from './services';
import { logger } from './utils/logger';

/**
 * Middleware that 308-redirects plaintext HTTP to HTTPS. Only mounted in
 * production behind a TLS-terminating proxy (Railway, Render, ALB),
 * which is why the app also enables `trust proxy` so Express reads the
 * forwarded scheme from `X-Forwarded-Proto`.
 */
const httpsRedirect: RequestHandler = (req, res, next) => {
  if (req.secure || req.protocol === 'https') {
    next();
    return;
  }
  const host = req.headers.host;
  if (!host) {
    next();
    return;
  }
  // 308 preserves method + body across the redirect (important for POSTs).
  res.redirect(308, `https://${host}${req.originalUrl}`);
};

/** Shape of the response body emitted by the global error formatter. */
interface ErrorResponseBody {
  error: string;
  code: string;
  details?: unknown;
}

/**
 * Augmented `Error` type produced by service-layer throws. Optional
 * `statusCode` / `code` / `details` fields let handlers shape the
 * response without importing Express types.
 */
interface HttpError extends Error {
  statusCode?: number;
  status?: number;
  code?: string;
  details?: unknown;
}

/**
 * Terminal Express error handler. Must be registered LAST — after every
 * router — so it catches anything `next(err)` propagates upward. Emits
 * a uniform `{ error, code, details }` payload so the frontend can
 * render errors without branching per endpoint.
 */
const errorFormatter: ErrorRequestHandler = (err, req, res, _next) => {
  const httpErr = err as HttpError;
  const statusCode = httpErr.statusCode ?? httpErr.status ?? 500;

  logger.error(
    {
      err: {
        message: httpErr.message,
        code: httpErr.code,
        stack: httpErr.stack,
      },
      req: { method: req.method, url: req.originalUrl },
    },
    'request failed',
  );

  const body: ErrorResponseBody = {
    error: httpErr.message || 'Internal server error',
    code: httpErr.code || 'INTERNAL',
  };
  if (httpErr.details !== undefined) {
    body.details = httpErr.details;
  }
  res.status(statusCode).json(body);
};

/** Construct the Express app with the full middleware stack applied. */
export function createApp(config: AppConfig = loadConfig()): express.Express {
  const app = express();

  // Respect `X-Forwarded-*` headers when behind a proxy so rate-limit
  // keying on `req.ip` and the HTTPS check both see the real client.
  if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
    app.use(httpsRedirect);
  }

  // Security headers (CSP, HSTS, X-Content-Type-Options, …) before any
  // app logic so every response — including error responses — carries them.
  app.use(helmet());

  // CORS locked to the configured frontend origin (Req 29.2).
  app.use(corsMiddleware(config));

  // 100 kB body cap matches the expected size of the largest request
  // (payroll-run submissions with a few dozen employees encoded as JSON).
  app.use(express.json({ limit: '100kb' }));

  // Public, unauthenticated health probe — used by the Railway/Render
  // uptime checks and local `docker healthcheck`.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // SSE hub is a per-app singleton. `mountRoutes` stashes it on
  // `app.locals.sseHub` so the (middleware-less) SSE handler can read
  // it without closing over a factory-scoped reference.
  const sseHub = new SseHub();
  mountRoutes(app, { sseHub });

  // 404 fallback — anything that didn't match a route above is formatted
  // through the same error pipeline as thrown errors.
  app.use((req, res) => {
    const body: ErrorResponseBody = {
      error: `Not found: ${req.method} ${req.originalUrl}`,
      code: 'NOT_FOUND',
    };
    res.status(404).json(body);
  });

  // Global error formatter — MUST be last.
  app.use(errorFormatter);

  return app;
}

if (require.main === module) {
  const config = loadConfig();
  const app = createApp(config);

  // Background services are only started in non-test environments.
  // Tests instantiate the app through `createApp` directly and don't
  // want a live Solana subscription or Ika poller ticking behind them.
  if (process.env.NODE_ENV !== 'test') {
    const sseHub = app.locals.sseHub as SseHub;

    // TODO (Phase 1.5): uncomment once the Vaultic program is deployed
    // to devnet and the Prisma schema is migrated. Leaving the wiring
    // visible here keeps the bootstrap sequence in one place.
    //
    //   const eventListener = new VaulticEventListener(config, sseHub);
    //   await eventListener.start();
    //
    //   const ikaPoller = new IkaPoller(config);
    //   ikaPoller.start(sseHub);
    void sseHub;
    void VaulticEventListener;
    void IkaPoller;
  }

  app.listen(config.port, () => {
    logger.info({ port: config.port }, 'Vaultic backend listening');
  });
}

