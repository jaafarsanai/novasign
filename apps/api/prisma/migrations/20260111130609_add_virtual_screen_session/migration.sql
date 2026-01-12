-- CreateTable
CREATE TABLE "VirtualScreenSession" (
    "id" TEXT NOT NULL,
    "pairingCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VirtualScreenSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VirtualScreenSession_pairingCode_key" ON "VirtualScreenSession"("pairingCode");

-- CreateIndex
CREATE INDEX "VirtualScreenSession_createdAt_idx" ON "VirtualScreenSession"("createdAt");
