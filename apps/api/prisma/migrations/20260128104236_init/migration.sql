-- CreateEnum (safe)
DO $$
BEGIN
  CREATE TYPE "ChannelOrientation" AS ENUM ('landscape', 'portrait');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable Channel
CREATE TABLE IF NOT EXISTS "Channel" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "orientation" "ChannelOrientation" NOT NULL DEFAULT 'landscape',
    "layoutId" TEXT NOT NULL DEFAULT 'default',
    "zones" JSONB NOT NULL DEFAULT '{}',
    "transition" JSONB,
    "width" INTEGER,
    "height" INTEGER,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable ChannelZoneItem
CREATE TABLE IF NOT EXISTS "ChannelZoneItem" (
    "id" TEXT NOT NULL,
    "channelId" UUID NOT NULL,
    "zoneId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "schedule" JSONB,
    "schedules" JSONB,

    CONSTRAINT "ChannelZoneItem_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "Channel_layoutId_idx" ON "Channel"("layoutId");
CREATE INDEX IF NOT EXISTS "Channel_orientation_idx" ON "Channel"("orientation");
CREATE INDEX IF NOT EXISTS "ChannelZoneItem_channelId_idx" ON "ChannelZoneItem"("channelId");
CREATE INDEX IF NOT EXISTS "ChannelZoneItem_zoneId_idx" ON "ChannelZoneItem"("zoneId");

-- Foreign key (safe)
DO $$
BEGIN
  ALTER TABLE "ChannelZoneItem"
    ADD CONSTRAINT "ChannelZoneItem_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "Channel"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;