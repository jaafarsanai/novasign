/*
  Warnings:

  - The values [WAITING,ONLINE] on the enum `ScreenStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ScreenStatus_new" AS ENUM ('PENDING', 'LIVE', 'OFFLINE');
ALTER TABLE "public"."Screen" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Screen" ALTER COLUMN "status" TYPE "ScreenStatus_new" USING ("status"::text::"ScreenStatus_new");
ALTER TYPE "ScreenStatus" RENAME TO "ScreenStatus_old";
ALTER TYPE "ScreenStatus_new" RENAME TO "ScreenStatus";
DROP TYPE "public"."ScreenStatus_old";
ALTER TABLE "Screen" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterTable
ALTER TABLE "Screen" ADD COLUMN     "isVirtual" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "status" SET DEFAULT 'PENDING';
