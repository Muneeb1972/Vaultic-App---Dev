-- AlterTable: add plaintext compensation and vesting mirror fields to Employee.
-- All columns are nullable so existing rows are unaffected.

ALTER TABLE "Employee"
  ADD COLUMN "salarySol"           TEXT,
  ADD COLUMN "bonusSol"            TEXT,
  ADD COLUMN "performanceSol"      TEXT,
  ADD COLUMN "roleId"              INTEGER,
  ADD COLUMN "chainPreference"     INTEGER,
  ADD COLUMN "targetAddressHex"    TEXT,
  ADD COLUMN "totalAllocationSol"  TEXT,
  ADD COLUMN "vestingStart"        TEXT,
  ADD COLUMN "vestingCliffDays"    INTEGER,
  ADD COLUMN "vestingDurationDays" INTEGER;
