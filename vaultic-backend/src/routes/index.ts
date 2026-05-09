/**
 * Route mounting barrel (Task 20).
 *
 * Exposes a single `mountRoutes(app, deps)` entrypoint so `src/index.ts`
 * doesn't need to import every router directly. Keeping the mount
 * sequence here also means the canonical `/api/...` prefixes live in
 * one file — grepping for an endpoint path jumps here first.
 *
 * The factory pattern (`createXxxRouter(deps?)`) carries through from
 * each individual router so integration tests can stand the whole HTTP
 * surface up with a test-only SseHub / Prisma stub without needing to
 * replace `mountRoutes` itself.
 */
import type { Express } from 'express';

import type { SseHub } from '../services/sse';

import { createClaimsRouter } from './claims';
import { createEmployeesRouter } from './employees';
import { createEventsRouter } from './events';
import { createPayrollRouter } from './payroll';
import { createTreasuryRouter } from './treasury';

/** Dependencies the mount sequence must receive. */
export interface RouteDeps {
  /** Singleton SSE hub — stored in `app.locals.sseHub` for the events router. */
  sseHub: SseHub;
}

/**
 * Wire every `/api/...` router onto the provided Express app. The SSE
 * hub is stored in `app.locals` rather than passed through a factory
 * closure because the events handler re-reads it per request so tests
 * can swap it mid-run (see `routes/events.ts` rationale).
 */
export function mountRoutes(app: Express, deps: RouteDeps): void {
  app.locals.sseHub = deps.sseHub;

  app.use('/api/treasury', createTreasuryRouter());
  app.use('/api/employees', createEmployeesRouter());
  app.use('/api/payroll', createPayrollRouter());
  app.use('/api/claims', createClaimsRouter());
  app.use('/api/events', createEventsRouter());
}
