/*
  Warnings:

  - The values [UNPAIRED,PAIRED,LIVE] on the enum `ScreenStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `code` on the `Screen` table. All the data in the column will be lost.
  - You are about to drop the column `isPreview` on the `Screen` table. All the data in the column will be lost.
  - You are about to drop the column `osName` on the `Screen` table. All the data in the column will be lost.
  - You are about to drop the column `osVersion` on the `Screen` table. All the data in the column will be lost.
  - You are about to drop the column `resolution` on the `Screen` table. All the data in the column will be lost.
  - You are about to drop the column `timezone` on the `Screen` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `Screen` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[pairingCode]` on the table `Screen` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `pairingCode` to the `Screen` table without a default value. This is not possible if the table is not empty.
  - Made the column `name` on table `Screen` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ScreenStatus_new" AS ENUM ('WAITING', 'ONLINE', 'OFFLINE');
ALTER TABLE "public"."Screen" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Screen" ALTER COLUMN "status" TYPE "ScreenStatus_new" USING ("status"::text::"ScreenStatus_new");
ALTER TYPE "ScreenStatus" RENAME TO "ScreenStatus_old";
ALTER TYPE "ScreenStatus_new" RENAME TO "ScreenStatus";
DROP TYPE "public"."ScreenStatus_old";
ALTER TABLE "Screen" ALTER COLUMN "status" SET DEFAULT 'WAITING';
COMMIT;

-- DropIndex
DROP INDEX "Screen_code_key";

-- AlterTable
ALTER TABLE "Screen" DROP COLUMN "code",
DROP COLUMN "isPreview",
DROP COLUMN "osName",
DROP COLUMN "osVersion",
DROP COLUMN "resolution",
DROP COLUMN "timezone",
DROP COLUMN "type",
ADD COLUMN     "pairingCode" TEXT NOT NULL,
ALTER COLUMN "name" SET NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'WAITING';

-- DropEnum
DROP TYPE "ScreenType";

-- CreateIndex
CREATE UNIQUE INDEX "Screen_pairingCode_key" ON "Screen"("pairingCode");
