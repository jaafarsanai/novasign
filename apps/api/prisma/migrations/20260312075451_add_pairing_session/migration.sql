/*
  Warnings:

  - Added the required column `expiresAt` to the `VirtualScreenSession` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `VirtualScreenSession` table without a default value. This is not possible if the table is not empty.
  - Added the required column `workspaceId` to the `VirtualScreenSession` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PairingSessionType" AS ENUM ('VIRTUAL_SCREEN', 'DEVICE');

-- CreateEnum
CREATE TYPE "PairingSessionStatus" AS ENUM ('OPEN', 'CLAIMED', 'EXPIRED', 'CANCELLED');

-- DropIndex
DROP INDEX "VirtualScreenSession_createdAt_idx";

-- AlterTable
ALTER TABLE "VirtualScreenSession" ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "organizationId" TEXT NOT NULL,
ADD COLUMN     "workspaceId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "PairingSession" (
    "id" TEXT NOT NULL,
    "pairingCode" TEXT NOT NULL,
    "sessionType" "PairingSessionType" NOT NULL,
    "status" "PairingSessionStatus" NOT NULL DEFAULT 'OPEN',
    "organizationId" TEXT,
    "workspaceId" TEXT,
    "createdByUserId" TEXT,
    "screenId" TEXT,
    "deviceId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "claimedByUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PairingSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PairingSession_pairingCode_key" ON "PairingSession"("pairingCode");

-- CreateIndex
CREATE INDEX "PairingSession_organizationId_idx" ON "PairingSession"("organizationId");

-- CreateIndex
CREATE INDEX "PairingSession_workspaceId_idx" ON "PairingSession"("workspaceId");

-- CreateIndex
CREATE INDEX "PairingSession_status_idx" ON "PairingSession"("status");

-- CreateIndex
CREATE INDEX "PairingSession_expiresAt_idx" ON "PairingSession"("expiresAt");

-- CreateIndex
CREATE INDEX "PairingSession_createdByUserId_idx" ON "PairingSession"("createdByUserId");

-- AddForeignKey
ALTER TABLE "PairingSession" ADD CONSTRAINT "PairingSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PairingSession" ADD CONSTRAINT "PairingSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PairingSession" ADD CONSTRAINT "PairingSession_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
