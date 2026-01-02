-- CreateEnum
CREATE TYPE "ScreenKind" AS ENUM ('VIRTUAL', 'DEVICE');

-- AlterTable
ALTER TABLE "Screen" ADD COLUMN     "kind" "ScreenKind" NOT NULL DEFAULT 'VIRTUAL';

-- CreateIndex
CREATE INDEX "Screen_kind_idx" ON "Screen"("kind");
