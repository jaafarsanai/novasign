/*
  Idempotent migration for shadow DB / repeated apply safety.

  Fixes:
  - Playlist.items may already exist
  - Screen.pairedAt may already exist
*/

-- 1) Ensure enum exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ScreenOrientation') THEN
    CREATE TYPE "ScreenOrientation" AS ENUM ('LANDSCAPE', 'PORTRAIT');
  END IF;
END$$;

-- 2) Ensure Playlist.items exists + is NOT NULL with default [] for existing rows
ALTER TABLE "Playlist"
  ADD COLUMN IF NOT EXISTS "items" JSONB;

UPDATE "Playlist"
SET "items" = '[]'::jsonb
WHERE "items" IS NULL;

ALTER TABLE "Playlist"
  ALTER COLUMN "items" SET NOT NULL;

-- 3) Ensure Screen columns exist (pairedAt was causing your error)
ALTER TABLE "Screen"
  ADD COLUMN IF NOT EXISTS "pairedAt" TIMESTAMP(3);

ALTER TABLE "Screen"
  ADD COLUMN IF NOT EXISTS "timezone" TEXT;

UPDATE "Screen"
SET "timezone" = 'UTC'
WHERE "timezone" IS NULL;

ALTER TABLE "Screen"
  ALTER COLUMN "timezone" SET NOT NULL;

-- If your schema expects orientation
ALTER TABLE "Screen"
  ADD COLUMN IF NOT EXISTS "orientation" "ScreenOrientation";

UPDATE "Screen"
SET "orientation" = 'LANDSCAPE'
WHERE "orientation" IS NULL;

ALTER TABLE "Screen"
  ALTER COLUMN "orientation" SET NOT NULL;

-- If your schema expects assignedPlaylistId
ALTER TABLE "Screen"
  ADD COLUMN IF NOT EXISTS "assignedPlaylistId" TEXT;

-- 4) Create index if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'Screen_assignedPlaylistId_idx'
  ) THEN
    CREATE INDEX "Screen_assignedPlaylistId_idx" ON "Screen"("assignedPlaylistId");
  END IF;
END$$;

-- 5) Add FK constraint if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Screen_assignedPlaylistId_fkey'
  ) THEN
    ALTER TABLE "Screen"
      ADD CONSTRAINT "Screen_assignedPlaylistId_fkey"
      FOREIGN KEY ("assignedPlaylistId")
      REFERENCES "Playlist"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END$$;

