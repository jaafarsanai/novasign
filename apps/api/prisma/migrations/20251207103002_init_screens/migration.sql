/*
  Warnings:

  - You are about to drop the `Device` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Organization` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "ScreenType" AS ENUM ('VIRTUAL', 'PLAYER_APP', 'BROWSER');

-- CreateEnum
CREATE TYPE "ScreenStatus" AS ENUM ('UNPAIRED', 'PAIRED', 'LIVE', 'OFFLINE');

-- DropForeignKey
ALTER TABLE "Device" DROP CONSTRAINT "Device_organizationId_fkey";

-- DropTable
DROP TABLE "Device";

-- DropTable
DROP TABLE "Organization";

-- DropEnum
DROP TYPE "DeviceStatus";

-- CreateTable
CREATE TABLE "Screen" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "code" TEXT NOT NULL,
    "type" "ScreenType" NOT NULL DEFAULT 'VIRTUAL',
    "status" "ScreenStatus" NOT NULL DEFAULT 'UNPAIRED',
    "isPreview" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3),
    "timezone" TEXT,
    "osName" TEXT,
    "osVersion" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Screen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Screen_code_key" ON "Screen"("code");
