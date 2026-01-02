-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ScreenOrientation" AS ENUM ('LANDSCAPE', 'PORTRAIT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add columns to Playlist (items JSONB)
ALTER TABLE "Playlist"
  ADD COLUMN IF NOT EXISTS "items" JSONB;

UPDATE "Playlist"
SET "items" = '[]'::jsonb
WHERE "items" IS NULL;

ALTER TABLE "Playlist"
  ALTER COLUMN "items" SET DEFAULT '[]'::jsonb;

ALTER TABLE "Playlist"
  ALTER COLUMN "items" SET NOT NULL;

-- Add columns to Screen (orientation, timezone, pairedAt, assignedPlaylistId)
ALTER TABLE "Screen"
  ADD COLUMN IF NOT EXISTS "orientation" "ScreenOrientation" NOT NULL DEFAULT 'LANDSCAPE',
  ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS "pairedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "assignedPlaylistId" TEXT;

-- Foreign key for Screen.assignedPlaylistId
DO $$ BEGIN
  ALTER TABLE "Screen"
    ADD CONSTRAINT "Screen_assignedPlaylistId_fkey"
    FOREIGN KEY ("assignedPlaylistId") REFERENCES "Playlist"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

