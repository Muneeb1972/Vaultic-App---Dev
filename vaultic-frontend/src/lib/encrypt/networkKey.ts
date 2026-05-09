/**
 * Network encryption key discovery for the Encrypt program.
 *
 * Discovers the active `NetworkEncryptionKey` account on-chain and returns
 * the 32-byte key used to derive the `networkKeyPda`.
 *
 * encrypt-integration Req 6.5, Req 12.2, design §3.3.1
 *
 * ## Layout constants
 * Pinned from devnet investigation on 2026-05-10.
 * See `.kiro/specs/encrypt-integration/investigations/network-key-layout.md`.
 */

import { Connection, PublicKey } from '@solana/web3.js';
import {
  NETWORK_KEY_ACCOUNT_DISCRIMINATOR,
  IS_ACTIVE_OFFSET,
  KEY_FIELD_OFFSET,
  KEY_FIELD_LENGTH,
  NETWORK_KEY_ACCOUNT_LENGTH,
} from './networkKeyLayout';
import { NoActiveNetworkKeyError } from './types';

/** Devnet Encrypt program ID. */
const ENCRYPT_PROGRAM_ID = new PublicKey('4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8');

/**
 * Session-level cache keyed by RPC endpoint URL.
 * Cleared on wallet disconnect via `clearNetworkKeyCache()`.
 */
const cache = new Map<string, Buffer>();

/**
 * Discover the active network encryption key from the Encrypt program.
 *
 * Uses `getProgramAccounts` with a memcmp filter on the 1-byte native
 * discriminator (`7`) to find `NetworkEncryptionKey` accounts, then
 * returns the 32-byte key from the first active one.
 *
 * Result is cached per RPC endpoint for the session lifetime.
 *
 * @throws {NoActiveNetworkKeyError} if no active key is found.
 */
export async function getNetworkKey(connection: Connection): Promise<Buffer> {
  const cacheKey = connection.rpcEndpoint;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const accounts = await connection.getProgramAccounts(ENCRYPT_PROGRAM_ID, {
    commitment: 'confirmed',
    filters: [
      {
        memcmp: {
          offset: 0,
          bytes: NETWORK_KEY_ACCOUNT_DISCRIMINATOR.toString('base64'),
          encoding: 'base64',
        },
      },
    ],
  });

  // Find the first account with is_active = 1 and the expected length.
  const activeAccount = accounts.find((a) => {
    const data = a.account.data as Buffer;
    return (
      data.length === NETWORK_KEY_ACCOUNT_LENGTH &&
      data[IS_ACTIVE_OFFSET] === 1
    );
  });

  if (!activeAccount) {
    throw new NoActiveNetworkKeyError();
  }

  const data = activeAccount.account.data as Buffer;
  const key = Buffer.from(data.subarray(KEY_FIELD_OFFSET, KEY_FIELD_OFFSET + KEY_FIELD_LENGTH));

  cache.set(cacheKey, key);
  return key;
}

/**
 * Clear the network key cache.
 * Call on wallet disconnect or when switching clusters.
 */
export function clearNetworkKeyCache(): void {
  cache.clear();
}
