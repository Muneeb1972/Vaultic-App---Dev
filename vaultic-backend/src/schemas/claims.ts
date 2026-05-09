/**
 * Claim request schemas (Task 20.4).
 *
 * The handler additionally verifies the signing wallet matches the
 * referenced Employee's `walletAddress` — only the employee themselves
 * can submit a claim against their record (Req 9.1).
 */
import { z } from 'zod';

const base58Pubkey = z
  .string()
  .regex(
    /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
    'must be a base58-encoded Solana public key (32–44 chars)',
  );

/**
 * `POST /api/claims` body. `amount` is a bigint encoded as a decimal
 * string — JSON has no native bigint support, and the contract's
 * `amount: u64` column can hold values beyond `Number.MAX_SAFE_INTEGER`.
 * The string is converted to `BigInt` at the Prisma boundary.
 *
 * `targetChain` matches the contract's `u8` encoding (0=ETH, 1=BTC,
 * 2=SOL — see design §3.1.2 DWalletCurveType block).
 */
export const ClaimCreate = z
  .object({
    /** ClaimRecord PDA on-chain. */
    onchainAddress: base58Pubkey,
    /** Prisma cuid of the Employee row claiming. */
    employeeId: z.string().cuid(),
    /** Prisma cuid of the Treasury the claim pays from. */
    treasuryId: z.string().cuid(),
    /** u64 amount in lamports (or target-chain base units), as decimal string. */
    amount: z.string().regex(/^\d+$/, 'amount must be a decimal u64 string'),
    /** Target chain: 0=ETH, 1=BTC, 2=SOL. */
    targetChain: z.number().int().min(0).max(2),
  })
  .strict();
export type ClaimCreate = z.infer<typeof ClaimCreate>;

/**
 * Path parameter for `GET /api/claims/:wallet` — the employee's Solana
 * wallet address. Base58 only (no cuid shape here since the wallet is
 * exposed directly in URLs for the employee portal).
 */
export const ClaimsWalletParams = z
  .object({
    wallet: base58Pubkey,
  })
  .strict();
export type ClaimsWalletParams = z.infer<typeof ClaimsWalletParams>;
