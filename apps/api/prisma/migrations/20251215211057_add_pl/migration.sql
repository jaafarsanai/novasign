-- DropIndex
DROP INDEX IF EXISTS "Screen_assignedPlaylistId_idx";

-- AlterTable
ALTER TABLE "Playlist" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DRAFT';
