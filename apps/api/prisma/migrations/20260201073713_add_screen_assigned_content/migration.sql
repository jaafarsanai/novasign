-- AlterTable
ALTER TABLE "Screen" ADD COLUMN     "assignedContentId" TEXT,
ADD COLUMN     "assignedContentType" TEXT;

-- CreateIndex
CREATE INDEX "Screen_assignedContentType_idx" ON "Screen"("assignedContentType");

-- CreateIndex
CREATE INDEX "Screen_assignedContentId_idx" ON "Screen"("assignedContentId");
