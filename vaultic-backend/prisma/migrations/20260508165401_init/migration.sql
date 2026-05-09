-- CreateEnum
CREATE TYPE "DWalletStatus" AS ENUM ('Pending', 'InProgress', 'Ready', 'Failed');

-- CreateTable
CREATE TABLE "Treasury" (
    "id" TEXT NOT NULL,
    "onchainAddress" TEXT NOT NULL,
    "authorityWallet" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dwalletPubkey" TEXT,
    "dwalletCurveType" INTEGER,
    "dwalletStatus" "DWalletStatus" NOT NULL DEFAULT 'Pending',
    "dkgStartedAt" TIMESTAMP(3),
    "dkgCompletedAt" TIMESTAMP(3),

    CONSTRAINT "Treasury_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "onchainAddress" TEXT NOT NULL,
    "treasuryId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "treasuryId" TEXT NOT NULL,
    "onchainAddress" TEXT NOT NULL,
    "executionId" BIGINT NOT NULL,
    "status" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "employeesProcessed" INTEGER NOT NULL,
    "ikaMessageHash" TEXT,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "treasuryId" TEXT NOT NULL,
    "onchainAddress" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "targetChain" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "ikaMessageHash" TEXT,
    "ikaSignature" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "actorWallet" TEXT NOT NULL,
    "treasuryId" TEXT,
    "metadata" JSONB NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Treasury_onchainAddress_key" ON "Treasury"("onchainAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_onchainAddress_key" ON "Employee"("onchainAddress");

-- CreateIndex
CREATE INDEX "Employee_treasuryId_idx" ON "Employee"("treasuryId");

-- CreateIndex
CREATE INDEX "Employee_walletAddress_idx" ON "Employee"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_onchainAddress_key" ON "PayrollRun"("onchainAddress");

-- CreateIndex
CREATE INDEX "PayrollRun_treasuryId_idx" ON "PayrollRun"("treasuryId");

-- CreateIndex
CREATE UNIQUE INDEX "Claim_onchainAddress_key" ON "Claim"("onchainAddress");

-- CreateIndex
CREATE INDEX "Claim_employeeId_idx" ON "Claim"("employeeId");

-- CreateIndex
CREATE INDEX "Claim_treasuryId_idx" ON "Claim"("treasuryId");

-- CreateIndex
CREATE INDEX "AuditLog_treasuryId_idx" ON "AuditLog"("treasuryId");

-- CreateIndex
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_treasuryId_fkey" FOREIGN KEY ("treasuryId") REFERENCES "Treasury"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_treasuryId_fkey" FOREIGN KEY ("treasuryId") REFERENCES "Treasury"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_treasuryId_fkey" FOREIGN KEY ("treasuryId") REFERENCES "Treasury"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_treasuryId_fkey" FOREIGN KEY ("treasuryId") REFERENCES "Treasury"("id") ON DELETE SET NULL ON UPDATE CASCADE;
