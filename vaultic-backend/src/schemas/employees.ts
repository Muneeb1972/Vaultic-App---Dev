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

/**
 * `POST /api/employees` body. `email` is optional — not every DAO
 * collects employee email addresses (Req 25.2), and the frontend treats
 * a missing value as "no notifications".
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
 * `PATCH /api/employees/:id` body — only the off-chain display fields
 * (name, email) are mutable. On-chain compensation and vesting fields
 * are immutable once the `register_employee` transaction is confirmed.
 */
export const EmployeeUpdate = z
  .object({
    name: z.string().min(1).max(128).optional(),
    email: z.string().email().optional().or(z.literal("")),
  })
  .strict()
  .refine((v) => v.name !== undefined || v.email !== undefined, {
    message: 'At least one field (name or email) must be provided',
  });
export type EmployeeUpdate = z.infer<typeof EmployeeUpdate>;
