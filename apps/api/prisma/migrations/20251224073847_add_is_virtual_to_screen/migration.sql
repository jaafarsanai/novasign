/*
  Warnings:

  - You are about to drop the column `kind` on the `Screen` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Screen_kind_idx";

-- AlterTable
ALTER TABLE "Screen" DROP COLUMN "kind",
ADD COLUMN     "isVirtual" BOOLEAN NOT NULL DEFAULT false;

-- DropEnum
DROP TYPE "ScreenKind";

-- CreateIndex
CREATE INDEX "Screen_isVirtual_idx" ON "Screen"("isVirtual");
