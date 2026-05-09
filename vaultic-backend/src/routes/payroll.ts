/**
 * Payroll REST router (Task 20.3).
 *
 * Endpoints:
 *   GET /api/payroll/:treasuryId/runs    public, list last N payroll runs
 *
 * Writes to `PayrollRun` come from the event listener (Task 19.2), not
 * from HTTP — the on-chain program is the source of truth. The admin
 * dashboard calls this endpoint to render the payroll history table.
 */
import { Router, type RequestHandler } from 'express';

import { readLimiter } from '../middleware/rateLimit';
import { validateParams, validateQuery } from '../middleware/validate';
import { prisma } from '../prisma';
import { PayrollListQuery, PayrollRunParams } from '../schemas/payroll';

/** Default page size when the caller omits `?limit=`. */
const DEFAULT_LIMIT = 50;

/**
 * `GET /api/payroll/:treasuryId/runs` — return the last N payroll runs
 * for the given treasury, newest first. `executionId` is a `BigInt`
 * column and JSON has no native BigInt support, so we stringify it in
 * the response payload.
 */
const listPayrollRuns: RequestHandler = async (req, res, next) => {
  try {
    const { treasuryId } = req.params as unknown as PayrollRunParams;
    const { limit } = req.query as unknown as PayrollListQuery;
    const take = limit ?? DEFAULT_LIMIT;

    const rows = await prisma.payrollRun.findMany({
      where: { treasuryId },
      orderBy: { timestamp: 'desc' },
      take,
    });

    // Stringify BigInt columns so `res.json` doesn't throw. Keep the
    // rest of the row shape stable so the frontend treats only the
    // expected field as a string.
    const serialised = rows.map((row) => ({
      ...row,
      executionId: row.executionId.toString(),
    }));

    res.json({ runs: serialised });
  } catch (err) {
    next(err);
  }
};

/** Build the Payroll router. */
export function createPayrollRouter(): Router {
  const router = Router();

  router.get(
    '/:treasuryId/runs',
    readLimiter,
    validateParams(PayrollRunParams),
    validateQuery(PayrollListQuery),
    listPayrollRuns,
  );

  return router;
}
