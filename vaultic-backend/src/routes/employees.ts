/**
 * Employees REST router (Task 20.2).
 *
 * Endpoints:
 *   GET  /api/employees?treasuryId=cuid   public, list by treasury
 *   POST /api/employees                   authed, create an Employee row
 *
 * Cross-row invariant enforced by the POST handler: the signing wallet
 * (populated by `authMiddleware`) must equal the parent Treasury's
 * `authorityWallet`. Only the treasury admin can register employees
 * (Req 2.1).
 */
import { Router, type RequestHandler } from 'express';

import { authMiddleware } from '../middleware/auth';
import { readLimiter, writeLimiter } from '../middleware/rateLimit';
import { validateBody, validateQuery } from '../middleware/validate';
import { prisma } from '../prisma';
import { EmployeeCreate, EmployeesListQuery, EmployeeUpdate } from '../schemas/employees';

/** Page cap for the employee listing. */
const LIST_LIMIT = 100;

/**
 * `GET /api/employees?treasuryId=...` — list every Employee row for
 * the requested Treasury, newest first. Public: the on-chain
 * `EmployeeRecord` PDAs are readable via Solana RPC and this is just
 * the off-chain mirror.
 */
const listEmployees: RequestHandler = async (req, res, next) => {
  try {
    const { treasuryId } = req.query as unknown as EmployeesListQuery;
    const rows = await prisma.employee.findMany({
      where: { treasuryId },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    });
    res.json({ employees: rows });
  } catch (err) {
    next(err);
  }
};

/**
 * `POST /api/employees` — persist an Employee row once the treasury
 * admin submits the on-chain `register_employee` transaction. Authed:
 * the caller must prove ownership of `Treasury.authorityWallet` (403
 * `WALLET_MISMATCH` otherwise), and the parent Treasury must exist
 * (404 otherwise).
 */
const createEmployee: RequestHandler = async (req, res, next) => {
  try {
    const caller = req.user!.walletAddress;
    const body = req.body as EmployeeCreate;

    const treasury = await prisma.treasury.findUnique({
      where: { id: body.treasuryId },
      select: { id: true, authorityWallet: true },
    });
    if (treasury === null) {
      res
        .status(404)
        .json({ error: 'Treasury not found', code: 'NOT_FOUND' });
      return;
    }
    if (treasury.authorityWallet !== caller) {
      res.status(403).json({
        error: 'Only the treasury authority may register employees',
        code: 'WALLET_MISMATCH',
      });
      return;
    }

    const created = await prisma.employee.create({
      data: {
        onchainAddress: body.onchainAddress,
        treasuryId: body.treasuryId,
        walletAddress: body.walletAddress,
        name: body.name,
        email: body.email ?? null,
        salarySol: body.salarySol ?? null,
        bonusSol: body.bonusSol ?? null,
        performanceSol: body.performanceSol ?? null,
        roleId: body.roleId ?? null,
        chainPreference: body.chainPreference ?? null,
        targetAddressHex: body.targetAddressHex ?? null,
        totalAllocationSol: body.totalAllocationSol ?? null,
        vestingStart: body.vestingStart ?? null,
        vestingCliffDays: body.vestingCliffDays ?? null,
        vestingDurationDays: body.vestingDurationDays ?? null,
      },
    });

    res.status(201).json({ employee: created });
  } catch (err) {
    next(err);
  }
};

/**
 * `PATCH /api/employees/:id` — update the off-chain display fields
 * (name, email) for an existing Employee row. Authed: the signing wallet
 * must match the parent Treasury's `authorityWallet`.
 *
 * On-chain compensation and vesting fields are immutable — they can only
 * be changed by re-registering the employee on-chain.
 */
const updateEmployee: RequestHandler = async (req, res, next) => {
  try {
    const caller = req.user!.walletAddress;
    const { id } = req.params as { id: string };
    const body = req.body as EmployeeUpdate;

    const employee = await prisma.employee.findUnique({
      where: { id },
      include: { treasury: { select: { authorityWallet: true } } },
    });
    if (employee === null) {
      res.status(404).json({ error: 'Employee not found', code: 'NOT_FOUND' });
      return;
    }
    if (employee.treasury.authorityWallet !== caller) {
      res.status(403).json({
        error: 'Only the treasury authority may update employees',
        code: 'WALLET_MISMATCH',
      });
      return;
    }

    const updated = await prisma.employee.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.email !== undefined ? { email: body.email || null } : {}),
        ...(body.salarySol !== undefined ? { salarySol: body.salarySol } : {}),
        ...(body.bonusSol !== undefined ? { bonusSol: body.bonusSol } : {}),
        ...(body.performanceSol !== undefined ? { performanceSol: body.performanceSol } : {}),
        ...(body.roleId !== undefined ? { roleId: body.roleId } : {}),
        ...(body.chainPreference !== undefined ? { chainPreference: body.chainPreference } : {}),
        ...(body.targetAddressHex !== undefined ? { targetAddressHex: body.targetAddressHex } : {}),
        ...(body.totalAllocationSol !== undefined ? { totalAllocationSol: body.totalAllocationSol } : {}),
        ...(body.vestingStart !== undefined ? { vestingStart: body.vestingStart } : {}),
        ...(body.vestingCliffDays !== undefined ? { vestingCliffDays: body.vestingCliffDays } : {}),
        ...(body.vestingDurationDays !== undefined ? { vestingDurationDays: body.vestingDurationDays } : {}),
      },
    });

    res.json({ employee: updated });
  } catch (err) {
    next(err);
  }
};

/** Build the Employees router. */
export function createEmployeesRouter(): Router {
  const router = Router();

  router.get('/', readLimiter, validateQuery(EmployeesListQuery), listEmployees);
  router.post(
    '/',
    writeLimiter,
    authMiddleware,
    validateBody(EmployeeCreate),
    createEmployee,
  );
  router.patch(
    '/:id',
    writeLimiter,
    authMiddleware,
    validateBody(EmployeeUpdate),
    updateEmployee,
  );

  return router;
}
