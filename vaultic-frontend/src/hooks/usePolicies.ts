"use client";

/**
 * usePolicies / useProposals — list policy + proposal accounts for a treasury
 * (Task 26.4).
 *
 * Both PDAs store `treasury: Pubkey` as the first field after the 8-byte
 * discriminator, so the memcmp offset is 8.
 */
import { type IdlAccounts } from "@coral-xyz/anchor";
import { type PublicKey } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";

import { useVaulticProgram } from "@/lib/anchor";
import type { Vaultic } from "@/lib/idl";

export type PolicyAccountData = IdlAccounts<Vaultic>["policyAccount"];
export type ProposalAccount = IdlAccounts<Vaultic>["transactionProposal"];

export interface PolicyEntry {
  publicKey: PublicKey;
  account: PolicyAccountData;
}

export interface ProposalEntry {
  publicKey: PublicKey;
  account: ProposalAccount;
}

export function usePolicies(treasuryPda: PublicKey | null) {
  const program = useVaulticProgram();

  return useQuery({
    queryKey: ["policies", treasuryPda?.toBase58() ?? null],
    queryFn: async (): Promise<PolicyEntry[]> => {
      if (!program || !treasuryPda) return [];
      const results = await program.account.policyAccount.all([
        { memcmp: { offset: 8, bytes: treasuryPda.toBase58() } },
      ]);
      return results
        .map((entry) => ({
          publicKey: entry.publicKey,
          account: entry.account as PolicyAccountData,
        }))
        // Sort ascending by policy_id so the UI is stable across renders.
        .sort((a, b) => a.account.policyId.cmp(b.account.policyId));
    },
    staleTime: 30_000,
    enabled: program !== null && treasuryPda !== null,
  });
}

export function useProposals(treasuryPda: PublicKey | null) {
  const program = useVaulticProgram();

  return useQuery({
    queryKey: ["proposals", treasuryPda?.toBase58() ?? null],
    queryFn: async (): Promise<ProposalEntry[]> => {
      if (!program || !treasuryPda) return [];
      const results = await program.account.transactionProposal.all([
        { memcmp: { offset: 8, bytes: treasuryPda.toBase58() } },
      ]);
      return results
        .map((entry) => ({
          publicKey: entry.publicKey,
          account: entry.account as ProposalAccount,
        }))
        // Newest proposals first by `proposed_at`.
        .sort((a, b) => b.account.proposedAt.cmp(a.account.proposedAt));
    },
    staleTime: 30_000,
    enabled: program !== null && treasuryPda !== null,
  });
}
