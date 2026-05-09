/**
 * Pinned layout constants for the Encrypt program's `NetworkEncryptionKey` account.
 *
 * Derived from devnet investigation on 2026-05-10.
 * Source: `.kiro/specs/encrypt-integration/investigations/network-key-layout.md`
 *
 * Account layout (36 bytes total):
 *   [disc(1) | is_active(1) | key(32) | version(1) | bump(1)]
 *
 * The Encrypt program is a native Solana program (not Anchor), so the
 * discriminator is a single byte (`7`), not an 8-byte Anchor hash.
 */

/** 1-byte native discriminator for `NetworkEncryptionKey` accounts. */
export const NETWORK_KEY_ACCOUNT_DISCRIMINATOR: Buffer = Buffer.from([7]);

/** Byte offset of the `is_active: bool` field (1 = active, 0 = inactive). */
export const IS_ACTIVE_OFFSET: number = 1;

/** Byte offset of the 32-byte `key` field. */
export const KEY_FIELD_OFFSET: number = 2;

/** Length of the `key` field in bytes. */
export const KEY_FIELD_LENGTH: number = 32;

/**
 * Total expected account data length for a `NetworkEncryptionKey` account.
 * Used as a sanity check when parsing account data.
 */
export const NETWORK_KEY_ACCOUNT_LENGTH: number = 36;
