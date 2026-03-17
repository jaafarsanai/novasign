-- CreateTable
CREATE TABLE "License" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "licenseType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "planCode" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "trialDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "License_tenantId_key" ON "License"("tenantId");
