/**
 * Payroll request schemas (Task 20.3).
 *
 * `/api/payroll/:treasuryId/runs` is a read-only listing keyed by the
 * parent Treasury's cuid. The `limit` query parameter lets the admin
 * dashboard page through history; it's optional and defaults to 50 on
 * the handler side.
 */
import { z } from 'zod';

/** Path parameters for `GET /api/payroll/:treasuryId/runs`. */
export const PayrollRunParams = z
  .object({
    treasuryId: z.string().cuid(),
  })
  .strict();
export type PayrollRunParams = z.infer<typeof PayrollRunParams>;

/**
 * Query string for `GET /api/payroll/:treasuryId/runs`. `limit` coerces
 * the raw string (`req.query` values arrive as strings) into an integer
 * and bounds it to 1..=100; the handler applies a default of 50 when
 * the key is absent.
 */
export const PayrollListQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();
export type PayrollListQuery = z.infer<typeof PayrollListQuery>;
