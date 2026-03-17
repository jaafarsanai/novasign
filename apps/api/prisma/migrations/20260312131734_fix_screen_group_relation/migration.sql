/*
  Manual migration edits applied to support existing data safely.
  Key fixes:
  - Preserve and cast License.status instead of drop/recreate
  - Backfill NULL ownership/scope fields before SET NOT NULL
  - Add Screen.runtimeKey as nullable first, backfill, then enforce NOT NULL + unique
  - Backfill organizationId from workspace / legacy tenant-derived org where possible
  - Preserve old Screen.pairingCode by copying into PairingSession metadata before drop
*/

-- Ensure UUID generator exists for runtimeKey backfill/default
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'ScreenStatus'
  ) THEN
    CREATE TYPE "ScreenStatus" AS ENUM ('PENDING', 'PAIRED', 'OFFLINE', 'ARCHIVED');
  END IF;
END$$;

-- Drop old indexes that Prisma wants removed
DROP INDEX IF EXISTS "Screen_assignedContentId_idx";
DROP INDEX IF EXISTS "Screen_assignedContentType_idx";
DROP INDEX IF EXISTS "Screen_assignedPlaylistId_idx";
DROP INDEX IF EXISTS "Screen_isArchived_idx";
DROP INDEX IF EXISTS "Screen_isVirtual_idx";
DROP INDEX IF EXISTS "Screen_pairingCode_key";

------------------------------------------------------
-- DATA BACKFILL / NORMALIZATION
------------------------------------------------------

-- 1) License.status string -> enum-safe normalization
UPDATE "License"
SET "status" = UPPER(TRIM("status"))
WHERE "status" IS NOT NULL;

UPDATE "License"
SET "status" = 'ACTIVE'
WHERE "status" NOT IN ('ACTIVE', 'EXPIRED', 'CANCELLED', 'TRIAL', 'SUSPENDED');

-- 2) Backfill organizationId on tenant-owned records if possible
-- Assumption: there is at least one Organization corresponding to each legacy Tenant slug.
-- This maps by slug first. Adjust if your real mapping differs.
UPDATE "License" l
SET "organizationId" = o."id"
FROM "Tenant" t
JOIN "Organization" o ON o."slug" = t."slug"
WHERE l."organizationId" IS NULL
  AND l."tenantId" = t."id";

UPDATE "Screen" s
SET "organizationId" = w."organizationId"
FROM "Workspace" w
WHERE s."organizationId" IS NULL
  AND s."workspaceId" = w."id";

UPDATE "Playlist" p
SET "organizationId" = w."organizationId"
FROM "Workspace" w
WHERE p."organizationId" IS NULL
  AND p."workspaceId" = w."id";

UPDATE "Channel" c
SET "organizationId" = w."organizationId"
FROM "Workspace" w
WHERE c."organizationId" IS NULL
  AND c."workspaceId" = w."id";

UPDATE "Media" m
SET "organizationId" = w."organizationId"
FROM "Workspace" w
WHERE m."organizationId" IS NULL
  AND m."workspaceId" = w."id";

UPDATE "MediaFolder" mf
SET "organizationId" = w."organizationId"
FROM "Workspace" w
WHERE mf."organizationId" IS NULL
  AND mf."workspaceId" = w."id";

UPDATE "PairingSession" ps
SET "organizationId" = w."organizationId"
FROM "Workspace" w
WHERE ps."organizationId" IS NULL
  AND ps."workspaceId" = w."id";

-- Fallback for remaining license rows if they still have tenantId and org slug mapping exists
UPDATE "Screen" s
SET "organizationId" = o."id"
FROM "User" u
JOIN "Tenant" t ON t."id" = u."tenantId"
JOIN "Organization" o ON o."slug" = t."slug"
WHERE s."organizationId" IS NULL
  AND s."createdByUserId" = u."id";

UPDATE "Playlist" p
SET "organizationId" = o."id"
FROM "User" u
JOIN "Tenant" t ON t."id" = u."tenantId"
JOIN "Organization" o ON o."slug" = t."slug"
WHERE p."organizationId" IS NULL
  AND p."createdByUserId" = u."id";

UPDATE "Channel" c
SET "organizationId" = o."id"
FROM "User" u
JOIN "Tenant" t ON t."id" = u."tenantId"
JOIN "Organization" o ON o."slug" = t."slug"
WHERE c."organizationId" IS NULL
  AND c."createdByUserId" = u."id";

UPDATE "Media" m
SET "organizationId" = o."id"
FROM "User" u
JOIN "Tenant" t ON t."id" = u."tenantId"
JOIN "Organization" o ON o."slug" = t."slug"
WHERE m."organizationId" IS NULL
  AND m."createdByUserId" = u."id";

UPDATE "MediaFolder" mf
SET "organizationId" = o."id"
FROM "User" u
JOIN "Tenant" t ON t."id" = u."tenantId"
JOIN "Organization" o ON o."slug" = t."slug"
WHERE mf."organizationId" IS NULL
  AND mf."createdByUserId" = u."id";

UPDATE "PairingSession" ps
SET "organizationId" = o."id"
FROM "User" u
JOIN "Tenant" t ON t."id" = u."tenantId"
JOIN "Organization" o ON o."slug" = t."slug"
WHERE ps."organizationId" IS NULL
  AND ps."createdByUserId" = u."id";

-- 3) Backfill Media / MediaFolder scope fields before NOT NULL
UPDATE "Media"
SET "ownerType" = CASE
  WHEN "workspaceId" IS NULL THEN 'ORGANIZATION'::"MediaOwnerType"
  ELSE 'WORKSPACE'::"MediaOwnerType"
END
WHERE "ownerType" IS NULL;

UPDATE "Media"
SET "visibilityScope" = CASE
  WHEN "workspaceId" IS NULL THEN 'GLOBAL'::"MediaVisibilityScope"
  ELSE 'WORKSPACE'::"MediaVisibilityScope"
END
WHERE "visibilityScope" IS NULL;

UPDATE "MediaFolder"
SET "ownerType" = CASE
  WHEN "workspaceId" IS NULL THEN 'ORGANIZATION'::"MediaOwnerType"
  ELSE 'WORKSPACE'::"MediaOwnerType"
END
WHERE "ownerType" IS NULL;

UPDATE "MediaFolder"
SET "visibilityScope" = CASE
  WHEN "workspaceId" IS NULL THEN 'GLOBAL'::"MediaVisibilityScope"
  ELSE 'WORKSPACE'::"MediaVisibilityScope"
END
WHERE "visibilityScope" IS NULL;

-- 4) Preserve existing screen pairingCode values before dropping column
-- Store them in matching open PairingSession metadata when possible.
UPDATE "PairingSession" ps
SET "metadata" = COALESCE(ps."metadata", '{}'::jsonb) || jsonb_build_object('legacyScreenPairingCode', s."pairingCode")
FROM "Screen" s
WHERE ps."screenId" = s."id"
  AND s."pairingCode" IS NOT NULL
  AND s."pairingCode" <> '';

-- 5) Add runtimeKey nullable first, then backfill
ALTER TABLE "Screen"
ADD COLUMN IF NOT EXISTS "runtimeKey" TEXT;

UPDATE "Screen"
SET "runtimeKey" = gen_random_uuid()::text
WHERE "runtimeKey" IS NULL OR BTRIM("runtimeKey") = '';

------------------------------------------------------
-- SAFE SCHEMA CHANGES
------------------------------------------------------

-- Channel.organizationId required
ALTER TABLE "Channel"
ALTER COLUMN "organizationId" SET NOT NULL;

-- License.status cast instead of drop/recreate
ALTER TABLE "License"
ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "License"
ALTER COLUMN "status" TYPE "LicenseStatus"
USING ("status"::"LicenseStatus");

-- Media required fields
ALTER TABLE "Media"
ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "ownerType" SET DEFAULT 'WORKSPACE'::"MediaOwnerType",
ALTER COLUMN "ownerType" SET NOT NULL,
ALTER COLUMN "visibilityScope" SET DEFAULT 'WORKSPACE'::"MediaVisibilityScope",
ALTER COLUMN "visibilityScope" SET NOT NULL;

ALTER TABLE "MediaFolder"
ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "ownerType" SET DEFAULT 'WORKSPACE'::"MediaOwnerType",
ALTER COLUMN "ownerType" SET NOT NULL,
ALTER COLUMN "visibilityScope" SET DEFAULT 'WORKSPACE'::"MediaVisibilityScope",
ALTER COLUMN "visibilityScope" SET NOT NULL;

-- PairingSession new columns + required org
ALTER TABLE "PairingSession"
ADD COLUMN IF NOT EXISTS "cancelReason" TEXT,
ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);

ALTER TABLE "PairingSession"
ALTER COLUMN "organizationId" SET NOT NULL;

-- Playlist.organizationId required
ALTER TABLE "Playlist"
ALTER COLUMN "organizationId" SET NOT NULL;

-- Screen safe alterations
ALTER TABLE "Screen"
ADD COLUMN IF NOT EXISTS "status" "ScreenStatus" NOT NULL DEFAULT 'PENDING';

ALTER TABLE "Screen"
ALTER COLUMN "timezone" DROP NOT NULL,
ALTER COLUMN "timezone" DROP DEFAULT,
ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "Screen"
ALTER COLUMN "runtimeKey" SET DEFAULT gen_random_uuid()::text;

ALTER TABLE "Screen"
ALTER COLUMN "runtimeKey" SET NOT NULL;

-- Only now drop old pairingCode
ALTER TABLE "Screen"
DROP COLUMN IF EXISTS "pairingCode";

------------------------------------------------------
-- DROP OLD TABLE
------------------------------------------------------

DROP TABLE IF EXISTS "VirtualScreenSession";

------------------------------------------------------
-- NEW INDEXES / CONSTRAINTS
------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS "Channel_organizationId_workspaceId_name_key"
ON "Channel"("organizationId", "workspaceId", "name");

CREATE INDEX IF NOT EXISTS "License_status_idx" ON "License"("status");
CREATE INDEX IF NOT EXISTS "License_startsAt_idx" ON "License"("startsAt");
CREATE INDEX IF NOT EXISTS "License_expiresAt_idx" ON "License"("expiresAt");

CREATE INDEX IF NOT EXISTS "PairingSession_screenId_idx" ON "PairingSession"("screenId");
CREATE INDEX IF NOT EXISTS "PairingSession_claimedByUserId_idx" ON "PairingSession"("claimedByUserId");
CREATE INDEX IF NOT EXISTS "PairingSession_deviceId_idx" ON "PairingSession"("deviceId");

CREATE UNIQUE INDEX IF NOT EXISTS "Playlist_organizationId_workspaceId_name_key"
ON "Playlist"("organizationId", "workspaceId", "name");

CREATE UNIQUE INDEX IF NOT EXISTS "Screen_runtimeKey_key" ON "Screen"("runtimeKey");
CREATE INDEX IF NOT EXISTS "Screen_runtimeKey_idx" ON "Screen"("runtimeKey");
CREATE INDEX IF NOT EXISTS "Screen_status_idx" ON "Screen"("status");
CREATE INDEX IF NOT EXISTS "Screen_lastSeenAt_idx" ON "Screen"("lastSeenAt");

------------------------------------------------------
-- FOREIGN KEYS
------------------------------------------------------
UPDATE "PairingSession" ps
SET "screenId" = NULL
WHERE ps."screenId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "Screen" s
    WHERE s."id" = ps."screenId"
  );
  
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'PairingSession_claimedByUserId_fkey'
  ) THEN
    ALTER TABLE "PairingSession"
    ADD CONSTRAINT "PairingSession_claimedByUserId_fkey"
    FOREIGN KEY ("claimedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'PairingSession_screenId_fkey'
  ) THEN
    ALTER TABLE "PairingSession"
    ADD CONSTRAINT "PairingSession_screenId_fkey"
    FOREIGN KEY ("screenId") REFERENCES "Screen"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;