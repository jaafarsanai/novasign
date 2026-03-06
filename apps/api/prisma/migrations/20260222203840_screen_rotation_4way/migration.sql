/*
  Warnings:

  - A unique constraint covering the columns `[channelId,zoneId,clientId]` on the table `ChannelZoneItem` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ScreenOrientation" ADD VALUE 'LANDSCAPE_FLIPPED';
ALTER TYPE "ScreenOrientation" ADD VALUE 'PORTRAIT_FLIPPED';

-- AlterTable
ALTER TABLE "ChannelZoneItem" ADD COLUMN     "clientId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ChannelZoneItem_channelId_zoneId_clientId_key" ON "ChannelZoneItem"("channelId", "zoneId", "clientId");
