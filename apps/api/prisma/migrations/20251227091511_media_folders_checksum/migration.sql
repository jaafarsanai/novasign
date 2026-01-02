-- AlterTable
ALTER TABLE "Media" ADD COLUMN     "durationMs" INTEGER;

-- CreateIndex
CREATE INDEX "Media_createdAt_idx" ON "Media"("createdAt");
