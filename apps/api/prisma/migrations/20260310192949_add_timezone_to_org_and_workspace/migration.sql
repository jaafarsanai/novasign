-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'UTC';

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "timezone" TEXT;
