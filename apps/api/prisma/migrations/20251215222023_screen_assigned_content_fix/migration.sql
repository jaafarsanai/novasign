/*
  Warnings:

  - You are about to drop the column `name` on the `Media` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `Playlist` table. All the data in the column will be lost.
  - You are about to drop the column `claimedAt` on the `Screen` table. All the data in the column will be lost.
  - You are about to drop the column `contentUpdatedAt` on the `Screen` table. All the data in the column will be lost.
  - You are about to drop the column `isVirtual` on the `Screen` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `Screen` table. All the data in the column will be lost.
  - You are about to drop the `PlaylistItem` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "PlaylistItem" DROP CONSTRAINT "PlaylistItem_mediaId_fkey";

-- DropForeignKey
ALTER TABLE "PlaylistItem" DROP CONSTRAINT "PlaylistItem_playlistId_fkey";

-- DropIndex
DROP INDEX "Screen_assignedPlaylistId_idx";

-- AlterTable
ALTER TABLE "Media" DROP COLUMN "name";

-- AlterTable
ALTER TABLE "Playlist" DROP COLUMN "status";

-- AlterTable
ALTER TABLE "Screen" DROP COLUMN "claimedAt",
DROP COLUMN "contentUpdatedAt",
DROP COLUMN "isVirtual",
DROP COLUMN "status",
ALTER COLUMN "name" DROP DEFAULT;

-- DropTable
DROP TABLE "PlaylistItem";

-- DropEnum
DROP TYPE "ScreenStatus";
