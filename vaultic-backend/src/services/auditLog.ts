/**
 * Audit-log helper (Task 19.5, Req 12.3).
 *
 * One tiny facade so every call site — event listener, REST handlers, Ika
 * poller — persists `AuditLog` rows the same way. Doing this through a
 * helper (rather than peppering `prisma.auditLog.create` calls across the
 * codebase) centralises two invariants:
 *
 *   1. `actionType` is a known constant. Typos like `"PAYROLL_EXECTUED"`
 *      would escape a `string` column silently and break any dashboard
 *      that groups by this field.
 *   2. `metadata` is always an object, never a primitive. Prisma accepts
 *      primitives in `Json` columns but the downstream audit UI assumes
 *      object-shaped rows (design §3.2.2).
 *
 * The helper deliberately does NOT attach the current timestamp — the
 * Prisma schema has `timestamp DateTime @default(now())` and letting the
 * database stamp the row keeps ordering correct even if the app clock
 * drifts (NTP skew, container restart).
 */
import type { Prisma } from '@prisma/client';

import { prisma } from '../prisma';

/**
 * Canonical `actionType` values. Writing to `AuditLog.actionType` outside
 * this union is a type error; new event categories land here first so the
 * analytics pipeline and the event listener stay in lockstep.
 *
 * The nine values here cover:
 *   • the nine on-chain events (design §3.1.4), mapped via the event
 *     listener's `EVENT_TO_ACTION` table;
 *   • `POLICY_CHANGED` for off-chain policy edits submitted via the REST
 *     API (Req 8);
 *   • `DWALLET_CREATED` emitted when the DKG state machine transitions
 *     `Pending → Ready` (Req 28.1);
 *   • `DECRYPTION_REQUESTED` for `request_salary_decryption` (Req 5.2);
 *   • `EMPLOYEE_TERMINATED` for the off-chain soft-delete mirror of the
 *     on-chain event (Req 2.10).
 */
export const AUDIT_ACTION = {
  TREASURY_INITIALIZED: 'TREASURY_INITIALIZED',
  EMPLOYEE_REGISTERED: 'EMPLOYEE_REGISTERED',
  EMPLOYEE_TERMINATED: 'EMPLOYEE_TERMINATED',
  PAYROLL_EXECUTED: 'PAYROLL_EXECUTED',
  CLAIM_SUBMITTED: 'CLAIM_SUBMITTED',
  CLAIM_PROCESSED: 'CLAIM_PROCESSED',
  POLICY_CHANGED: 'POLICY_CHANGED',
  DWALLET_CREATED: 'DWALLET_CREATED',
  DECRYPTION_REQUESTED: 'DECRYPTION_REQUESTED',
} as const;

/** Union of the valid `actionType` string literals. */
export type AuditActionType = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];

/**
 * Payload for {@link recordAuditEntry}. `metadata` is typed as Prisma's
 * `InputJsonValue` so callers get proper type-checking for JSON-shaped
 * input (Date, BigInt, functions are rejected at compile time) while
 * still being able to pass arbitrary plain objects.
 *
 * `signature` / `logIndex` live inside `metadata` rather than as dedicated
 * columns to avoid a schema migration — idempotency for event-sourced
 * rows is enforced at the call site in `eventListener.ts` by a pre-insert
 * duplicate check against these metadata fields.
 */
export interface RecordAuditEntryInput {
  /** Canonical action type — pick from {@link AUDIT_ACTION}. */
  actionType: AuditActionType;
  /** Base58 wallet that initiated the action (tx signer or API caller). */
  actorWallet: string;
  /**
   * Treasury this action belongs to, if any. REST endpoints that operate
   * without a selected treasury (e.g. `/health`) omit this.
   */
  treasuryId?: string | null;
  /**
   * Free-form structured detail. Typical fields: `signature`, `logIndex`,
   * `eventName`, `employeeAddress`, `amount`. Stored verbatim in the
   * `metadata` JSON column.
   */
  metadata: Prisma.InputJsonValue;
}

/**
 * Insert a row into `AuditLog`. Returns the created record so callers can
 * include the row id in logs or downstream broadcasts. Throws if the
 * Prisma insert fails — audit writes must not be swallowed, otherwise
 * the audit trail quietly drifts from reality (Req 12.3).
 */
export async function recordAuditEntry(input: RecordAuditEntryInput) {
  return prisma.auditLog.create({
    data: {
      actionType: input.actionType,
      actorWallet: input.actorWallet,
      treasuryId: input.treasuryId ?? null,
      metadata: input.metadata,
    },
  });
}
