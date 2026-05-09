/**
 * Treasury REST router (Task 20.1).
 *
 * Endpoints:
 *   GET  /api/treasury                 public, paginated list of Treasury rows
 *   POST /api/treasury                 authed, create a Treasury row
 *   GET  /api/treasury/:id/dwallet     public, DKG tracking fields only
 *
 * The factory pattern (`createTreasuryRouter()`) is used by every route
 * module in this package so integration tests (Task 21) can inject
 * mocked dependencies without monkey-patching singletons. Treasury has
 * no dependencies today, but matching the shape up-front keeps the
 * mount point in `src/index.ts` uniform across all five routers.
 */
import { Router, type RequestHandler } from 'express';

import { authMiddleware } from '../middleware/auth';
import { readLimiter, writeLimiter } from '../middleware/rateLimit';
import { validateBody, validateParams } from '../middleware/validate';
import { prisma } from '../prisma';
import { TreasuryCreate, TreasuryIdParams } from '../schemas/treasury';

/** Hard cap on the `GET /api/treasury` page size. */
const LIST_LIMIT = 50;

/**
 * `GET /api/treasury` — list every tracked Treasury row, newest first.
 * Public by design: the authoritative state lives on-chain and is world
 * readable via Solana RPC, so gating the off-chain mirror behind auth
 * would add friction without a security benefit.
 */
const listTreasuries: RequestHandler = async (_req, res, next) => {
  try {
    const rows = await prisma.treasury.findMany({
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    });
    res.json({ treasuries: rows });
  } catch (err) {
    next(err);
  }
};

/**
 * `POST /api/treasury` — persist a Treasury row once the admin has
 * submitted the on-chain `initialize_treasury` transaction. The
 * request is authed: the authority wallet must sign the request, and
 * `authorityWallet` in the body must equal the signing wallet (403
 * `WALLET_MISMATCH` otherwise — Req 11).
 *
 * The row is created with `dwalletStatus: 'Pending'` per the Prisma
 * default; the DKG flow (Task 19 / Req 28) flips it to
 * `InProgress → Ready | Failed`.
 */
const createTreasury: RequestHandler = async (req, res, next) => {
  try {
    // `authMiddleware` guarantees this is populated; the non-null
    // assertion keeps handlers readable without an explicit guard.
    const caller = req.user!.walletAddress;
    const body = req.body as TreasuryCreate;

    if (body.authorityWallet !== caller) {
      res.status(403).json({
        error: 'Authority wallet does not match signing wallet',
        code: 'WALLET_MISMATCH',
      });
      return;
    }

    const created = await prisma.treasury.create({
      data: {
        onchainAddress: body.onchainAddress,
        authorityWallet: body.authorityWallet,
        name: body.name,
      },
    });

    res.status(201).json({ treasury: created });
  } catch (err) {
    next(err);
  }
};

/**
 * `GET /api/treasury/:id/dwallet` — narrow projection returning only
 * the DKG lifecycle fields (Req 28.1). The frontend polls this while
 * the status is `Pending` / `InProgress` so the UI can show a spinner
 * without over-fetching the full Treasury row.
 */
const getTreasuryDwallet: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params as unknown as TreasuryIdParams;
    const row = await prisma.treasury.findUnique({
      where: { id },
      select: {
        id: true,
        dwalletPubkey: true,
        dwalletCurveType: true,
        dwalletStatus: true,
        dkgStartedAt: true,
        dkgCompletedAt: true,
      },
    });
    if (row === null) {
      res
        .status(404)
        .json({ error: 'Treasury not found', code: 'NOT_FOUND' });
      return;
    }
    res.json({ dwallet: row });
  } catch (err) {
    next(err);
  }
};

/**
 * Build the Treasury router. Factory form for consistency with the
 * other route modules — no deps are injected today but tests can still
 * stub individual handlers by re-wrapping this router.
 */
export function createTreasuryRouter(): Router {
  const router = Router();

  router.get('/', readLimiter, listTreasuries);
  router.post(
    '/',
    writeLimiter,
    authMiddleware,
    validateBody(TreasuryCreate),
    createTreasury,
  );
  router.get(
    '/:id/dwallet',
    readLimiter,
    validateParams(TreasuryIdParams),
    getTreasuryDwallet,
  );

  return router;
}
