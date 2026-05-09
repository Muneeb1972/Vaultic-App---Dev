/**
 * Claims REST router (Task 20.4).
 *
 * Endpoints:
 *   GET  /api/claims/:wallet   public, list claims for an employee wallet
 *   POST /api/claims           authed, create a Claim row
 *
 * Cross-row invariant enforced by the POST handler: the signing wallet
 * must equal the referenced Employee's `walletAddress`. Only the
 * employee themselves can submit a claim against their record (Req 9.1).
 */
import { Router, type RequestHandler } from 'express';

import { authMiddleware } from '../middleware/auth';
import { readLimiter, writeLimiter } from '../middleware/rateLimit';
import { validateBody, validateParams } from '../middleware/validate';
import { prisma } from '../prisma';
import { ClaimCreate, ClaimsWalletParams } from '../schemas/claims';

/** Page cap for the claims listing. */
const LIST_LIMIT = 100;

/**
 * Re-shape a Claim row for JSON transport: `amount` is a `BigInt`
 * column (u64 values don't fit in `Number.MAX_SAFE_INTEGER`), so we
 * render it as a decimal string the frontend can pass to `BigInt(...)`.
 */
function serialiseClaim<T extends { amount: bigint }>(row: T): T & { amount: string } {
  return { ...row, amount: row.amount.toString() };
}

/**
 * `GET /api/claims/:wallet` — list every claim ever submitted from
 * `:wallet`, newest first. The wallet doesn't have to be known off-chain
 * (the handler joins through `Employee.walletAddress`); if no matching
 * employee row exists we return an empty list rather than 404, so the
 * employee portal can render "no claims yet" for fresh wallets.
 */
const listClaimsForWallet: RequestHandler = async (req, res, next) => {
  try {
    const { wallet } = req.params as unknown as ClaimsWalletParams;
    const rows = await prisma.claim.findMany({
      where: { employee: { walletAddress: wallet } },
      orderBy: { submittedAt: 'desc' },
      take: LIST_LIMIT,
    });
    res.json({ claims: rows.map(serialiseClaim) });
  } catch (err) {
    next(err);
  }
};

/**
 * `POST /api/claims` — persist a Claim row once the employee submits
 * the on-chain `submit_claim` transaction. Authed: the signing wallet
 * must match the referenced Employee's `walletAddress` (403
 * `WALLET_MISMATCH` otherwise). The parent Employee must exist
 * (404 otherwise).
 */
const createClaim: RequestHandler = async (req, res, next) => {
  try {
    const caller = req.user!.walletAddress;
    const body = req.body as ClaimCreate;

    const employee = await prisma.employee.findUnique({
      where: { id: body.employeeId },
      select: { id: true, walletAddress: true, treasuryId: true },
    });
    if (employee === null) {
      res
        .status(404)
        .json({ error: 'Employee not found', code: 'NOT_FOUND' });
      return;
    }
    if (employee.walletAddress !== caller) {
      res.status(403).json({
        error: 'Only the employee may submit their own claim',
        code: 'WALLET_MISMATCH',
      });
      return;
    }

    // Sanity check: the body's treasuryId must match the employee's
    // own treasury. This catches UI bugs before they pollute the DB.
    if (employee.treasuryId !== body.treasuryId) {
      res.status(400).json({
        error: 'treasuryId does not match employee',
        code: 'TREASURY_MISMATCH',
      });
      return;
    }

    const created = await prisma.claim.create({
      data: {
        onchainAddress: body.onchainAddress,
        employeeId: body.employeeId,
        treasuryId: body.treasuryId,
        amount: BigInt(body.amount),
        targetChain: body.targetChain,
        status: 'Pending',
      },
    });

    res.status(201).json({ claim: serialiseClaim(created) });
  } catch (err) {
    next(err);
  }
};

/** Build the Claims router. */
export function createClaimsRouter(): Router {
  const router = Router();

  router.get(
    '/:wallet',
    readLimiter,
    validateParams(ClaimsWalletParams),
    listClaimsForWallet,
  );
  router.post(
    '/',
    writeLimiter,
    authMiddleware,
    validateBody(ClaimCreate),
    createClaim,
  );

  return router;
}
