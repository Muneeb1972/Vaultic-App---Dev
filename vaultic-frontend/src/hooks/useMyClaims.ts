"use client";

/**
 * useMyClaims — list `ClaimRecord` PDAs for the connected employee wallet
 * (Task 27.2, Req 18.5).
 *
 * `ClaimRecord.employee: Pubkey` is the first field after the 8-byte
 * Anchor discriminator, so a `memcmp` at offset 8 returns every claim
 * this wallet has submitted. Sorted newest-first by `claim_timestamp`
 * so the portal surfaces recent activity at the top.
 */
import { type IdlAccounts } from "@coral-xyz/anchor";
import { useWallet } from "@solana/wallet-adapter-react";
import { type PublicKey } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";

import { useVaulticProgram } from "@/lib/anchor";
import type { Vaultic } from "@/lib/idl";

export type ClaimRecordAccount = IdlAccounts<Vaultic>["claimRecord"];

export interface ClaimEntry {
  publicKey: PublicKey;
  account: ClaimRecordAccount;
}

export function useMyClaims() {
  const { publicKey } = useWallet();
  const program = useVaulticProgram();

  return useQuery({
    queryKey: ["myClaims", publicKey?.toBase58() ?? null],
    queryFn: async (): Promise<ClaimEntry[]> => {
      if (!program || !publicKey) return [];
      const results = await program.account.claimRecord.all([
        { memcmp: { offset: 8, bytes: publicKey.toBase58() } },
      ]);
      const sorted = [...results].sort((a, b) => {
        const aTs = (a.account as ClaimRecordAccount).claimTimestamp;
        const bTs = (b.account as ClaimRecordAccount).claimTimestamp;
        return bTs.cmp(aTs);
      });
      return sorted.map((entry) => ({
        publicKey: entry.publicKey,
        account: entry.account as ClaimRecordAccount,
      }));
    },
    staleTime: 30_000,
    enabled: program !== null && publicKey !== null,
  });
}
