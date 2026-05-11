/**
 * Employee request schemas (Task 20.2).
 *
 * The handler additionally verifies the signing wallet (populated by
 * `authMiddleware`) matches the owning Treasury's `authorityWallet`
 * before inserting the row — schemas can only enforce shape, not
 * cross-row invariants.
 */
import { z } from 'zod';

/** Same base58 shape rule as treasury.ts — duplicated to keep the */
/** schemas self-contained per route. */
const base58Pubkey = z
  .string()
  .regex(
    /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
    'must be a base58-encoded Solana public key (32–44 chars)',
  );

/** Non-negative decimal string representing a SOL amount. */
const solAmountString = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'must be a non-negative decimal number');

/**
 * `POST /api/employees` body. `email` is optional — not every DAO
 * collects employee email addresses (Req 25.2), and the frontend treats
 * a missing value as "no notifications".
 *
 * Compensation and vesting fields are optional — they are stored as a
 * convenience mirror so the Edit dialog can pre-fill them without
 * requiring the admin to re-enter values that are encrypted on-chain.
 */
export const EmployeeCreate = z
  .object({
    /** EmployeeRecord PDA on-chain. */
    onchainAddress: base58Pubkey,
    /** Prisma cuid of the parent Treasury row. */
    treasuryId: z.string().cuid(),
    /** Employee's Solana wallet — signs claims + decryption requests. */
    walletAddress: base58Pubkey,
    /** Display name for the dashboard (not on-chain). */
    name: z.string().min(1).max(128),
    /** Optional contact email for notifications. */
    email: z.string().email().optional(),

    // ── Compensation mirror (optional, stored for Edit pre-fill) ──
    salarySol: solAmountString.optional(),
    bonusSol: solAmountString.optional(),
    performanceSol: solAmountString.optional(),

    // ── On-chain field mirrors (optional, stored for Edit pre-fill) ──
    roleId: z.number().int().min(0).max(4).optional(),
    chainPreference: z.number().int().min(0).max(2).optional(),
    /** Target address as hex string or base58. */
    targetAddressHex: z.string().optional(),
    totalAllocationSol: solAmountString.optional(),
    /** ISO date string YYYY-MM-DD. */
    vestingStart: z.string().optional(),
    vestingCliffDays: z.number().int().nonnegative().optional(),
    vestingDurationDays: z.number().int().positive().optional(),
  })
  .strict();
export type EmployeeCreate = z.infer<typeof EmployeeCreate>;

/**
 * `GET /api/employees` query string. `treasuryId` is required because
 * the list endpoint always filters by owning treasury — a global employee
 * list is out of scope for the dashboard.
 */
export const EmployeesListQuery = z
  .object({
    treasuryId: z.string().cuid(),
  })
  .strict();
export type EmployeesListQuery = z.infer<typeof EmployeesListQuery>;

/**
 * `PATCH /api/employees/:id` body — all fields are optional; at least
 * one must be provided. Includes both off-chain display fields (name,
 * email) and the plaintext compensation/vesting mirrors.
 */
export const EmployeeUpdate = z
  .object({
    name: z.string().min(1).max(128).optional(),
    email: z.string().email().optional().or(z.literal('')),
    salarySol: solAmountString.optional(),
    bonusSol: solAmountString.optional(),
    performanceSol: solAmountString.optional(),
    roleId: z.number().int().min(0).max(4).optional(),
    chainPreference: z.number().int().min(0).max(2).optional(),
    targetAddressHex: z.string().optional(),
    totalAllocationSol: solAmountString.optional(),
    vestingStart: z.string().optional(),
    vestingCliffDays: z.number().int().nonnegative().optional(),
    vestingDurationDays: z.number().int().positive().optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.name !== undefined ||
      v.email !== undefined ||
      v.salarySol !== undefined ||
      v.bonusSol !== undefined ||
      v.performanceSol !== undefined ||
      v.roleId !== undefined ||
      v.chainPreference !== undefined ||
      v.targetAddressHex !== undefined ||
      v.totalAllocationSol !== undefined ||
      v.vestingStart !== undefined ||
      v.vestingCliffDays !== undefined ||
      v.vestingDurationDays !== undefined,
    { message: 'At least one field must be provided' },
  );
export type EmployeeUpdate = z.infer<typeof EmployeeUpdate>;
