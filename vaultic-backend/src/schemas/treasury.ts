/**
 * Treasury request schemas (Task 20.1).
 *
 * Zod schemas for every `/api/treasury*` handler. Kept alongside the
 * route file they validate so adding a new endpoint means editing two
 * files that live next to each other in the tree.
 *
 * Conventions:
 *   • `onchainAddress` / `authorityWallet` are base58 Solana pubkeys.
 *     Ed25519 keys encode to 32–44 base58 characters depending on the
 *     leading zero bytes; anything outside that range can't be a real
 *     pubkey. The regex also pins the alphabet (no `0`, `O`, `I`, `l`).
 *   • `id` is Prisma's `cuid()` default — Zod has a first-class check
 *     for it so typos never reach the DB layer.
 */
import { z } from 'zod';

/**
 * Base58 pubkey — 32..=44 characters over the Bitcoin alphabet. Tight
 * enough to reject obvious garbage (hex, spaces, length-0 strings) while
 * still accepting every valid Solana address. Full 32-byte validation
 * happens downstream via `new PublicKey(...)` when the value is used.
 */
const base58Pubkey = z
  .string()
  .regex(
    /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
    'must be a base58-encoded Solana public key (32–44 chars)',
  );

/**
 * `POST /api/treasury` body. The handler additionally enforces
 * `authorityWallet === req.user.walletAddress` (403 WALLET_MISMATCH).
 */
export const TreasuryCreate = z
  .object({
    /** Treasury_Config PDA on-chain. */
    onchainAddress: base58Pubkey,
    /** Wallet that authored the on-chain `initialize_treasury` tx. */
    authorityWallet: base58Pubkey,
    /** Human-readable label, matches the 64-byte bound in the contract. */
    name: z.string().min(1).max(64),
  })
  .strict();
export type TreasuryCreate = z.infer<typeof TreasuryCreate>;

/** Shared `:id` path parameter — Prisma cuids are fixed shape. */
export const TreasuryIdParams = z
  .object({
    id: z.string().cuid(),
  })
  .strict();
export type TreasuryIdParams = z.infer<typeof TreasuryIdParams>;
