/**
 * Human-readable mappings for the 18 `VaulticError` variants surfaced by
 * AnchorError (Task 28, Req 20.4).
 *
 * Keep the keys aligned with
 * `vaultic-contracts/programs/vaultic/src/errors.rs` — each value mirrors
 * the on-chain message but softened for end users. The generic fallback
 * is returned when an error code doesn't match any known variant.
 */

export const ERROR_MESSAGES: Record<string, string> = {
  Unauthorized: "You are not authorized to perform this action.",
  TreasuryInactive: "This treasury is inactive.",
  EmployeeInactive: "This employee is inactive.",
  InvalidRoleId: "Invalid role tier. Must be between 0 and 4.",
  InvalidChainPreference:
    "Invalid chain preference. Must be 0 (Solana), 1 (Ethereum), or 2 (Bitcoin).",
  PayrollIntervalNotElapsed:
    "Payroll interval has not elapsed yet. Try again later.",
  FHEExecutionFailed: "Encrypted computation failed. Please retry.",
  DecryptionNotComplete:
    "Decryption is not yet complete. Please wait and try again.",
  SpendingLimitExceeded: "Amount exceeds the treasury spending limit.",
  InsufficientApprovals: "Not enough approvers have signed yet.",
  TimeLockNotElapsed: "Policy time-lock has not elapsed.",
  PolicyInactive: "This policy is inactive.",
  ClaimExceedsVested: "Claim exceeds the unclaimed vested amount.",
  VestingCliffNotReached: "Vesting cliff has not been reached.",
  IkaSigningFailed: "Cross-chain signing failed. Please retry.",
  InvalidApproverCount: "Invalid approver count. Must be between 1 and 5.",
  NameTooLong: "Treasury name must be at most 64 bytes.",
  InvalidPayrollState: "Payroll run is in an invalid state for this action.",
};

/**
 * Extract a human-readable message from a caught error.
 *
 * Tries `AnchorError.error.errorCode.code` first, then falls back to the
 * error's `message` field, then a generic fallback. Kept defensive because
 * this runs inside toast handlers where throwing would lose the context.
 */
export function humanizeError(err: unknown): string {
  if (err === null || err === undefined) return "Unknown error";

  // AnchorError shape — `err.error.errorCode.code` carries the variant name.
  const anchorErr = err as {
    error?: { errorCode?: { code?: string; message?: string } };
    message?: string;
  };
  const code = anchorErr.error?.errorCode?.code;
  if (code && ERROR_MESSAGES[code]) {
    return ERROR_MESSAGES[code];
  }
  if (anchorErr.error?.errorCode?.message) {
    return anchorErr.error.errorCode.message;
  }
  if (anchorErr.message) return anchorErr.message;

  return "Transaction failed";
}
