/**
 * Encrypt_CPI_Account_Block derivation.
 *
 * Derives the nine PDAs required for every Vaultic instruction that creates
 * a ciphertext, and returns them in the order specified by Req 6.2.
 *
 * encrypt-integration Req 6.1–6.2, design §3.3.2
 *
 * ## Account order (Req 6.2)
 * 1. Encrypt_Program (read-only, non-signer)
 * 2. configPda (writable, non-signer)
 * 3. depositPda (writable, non-signer)
 * 4. cpiAuthority (read-only, non-signer)
 * 5. callerProgram / Vaultic_Program id (read-only, non-signer)
 * 6. networkKeyPda (read-only, non-signer)
 * 7. payer (writable, signer)
 * 8. eventAuthority (read-only, non-signer)
 * 9. SystemProgram (read-only, non-signer)
 */

import { Connection, PublicKey, SystemProgram } from '@solana/web3.js';
import { getNetworkKey } from './networkKey';

/** Devnet Encrypt program ID. */
export const ENCRYPT_PROGRAM_ID = new PublicKey('4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8');

/** Vaultic program ID. */
export const VAULTIC_PROGRAM_ID = new PublicKey('5igWLTbdAjGfAZKsK9G3Buhe7mkrgC3GEYkQaD4PrTnZ');

/** The nine PDAs + bumps for the Encrypt_CPI_Account_Block. */
export interface EncryptCpiAccounts {
  encryptProgram: PublicKey;
  configPda: PublicKey;
  depositPda: PublicKey;
  depositBump: number;
  cpiAuthority: PublicKey;
  cpiAuthorityBump: number;
  callerProgram: PublicKey;
  networkKeyPda: PublicKey;
  eventAuthority: PublicKey;
  systemProgram: PublicKey;
}

/**
 * Session-level cache keyed by `${rpcEndpoint}:${walletPubkey}`.
 */
const cache = new Map<string, EncryptCpiAccounts>();

/**
 * Derive all nine Encrypt_CPI_Account_Block PDAs for the given wallet.
 *
 * Results are memoized per (connection, wallet) pair for the session.
 *
 * @throws {NoActiveNetworkKeyError} if the network key cannot be discovered.
 */
export async function buildEncryptCpiAccounts(
  connection: Connection,
  wallet: PublicKey,
): Promise<EncryptCpiAccounts> {
  const cacheKey = `${connection.rpcEndpoint}:${wallet.toBase58()}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  // Derive PDAs.
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('encrypt_config')],
    ENCRYPT_PROGRAM_ID,
  );

  const [eventAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from('__event_authority')],
    ENCRYPT_PROGRAM_ID,
  );

  const [depositPda, depositBump] = PublicKey.findProgramAddressSync(
    [Buffer.from('encrypt_deposit'), wallet.toBuffer()],
    ENCRYPT_PROGRAM_ID,
  );

  // Discover the active network key and derive its PDA.
  const networkKey = await getNetworkKey(connection);
  const [networkKeyPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('network_encryption_key'), networkKey],
    ENCRYPT_PROGRAM_ID,
  );

  // CPI authority is derived from the VAULTIC program id (not Encrypt's).
  const [cpiAuthority, cpiAuthorityBump] = PublicKey.findProgramAddressSync(
    [Buffer.from('__encrypt_cpi_authority')],
    VAULTIC_PROGRAM_ID,
  );

  const result: EncryptCpiAccounts = {
    encryptProgram: ENCRYPT_PROGRAM_ID,
    configPda,
    depositPda,
    depositBump,
    cpiAuthority,
    cpiAuthorityBump,
    callerProgram: VAULTIC_PROGRAM_ID,
    networkKeyPda,
    eventAuthority,
    systemProgram: SystemProgram.programId,
  };

  cache.set(cacheKey, result);
  return result;
}

/**
 * Clear the CPI accounts cache.
 * Call on wallet disconnect or when switching clusters.
 */
export function clearCpiAccountsCache(): void {
  cache.clear();
}
