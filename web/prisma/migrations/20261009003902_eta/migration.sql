-- CreateEnum
CREATE TYPE "EtaStatus" AS ENUM ('NOT_SENT', 'SUBMITTED', 'VALID', 'INVALID', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "buildingNo" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'EG',
ADD COLUMN     "etaType" TEXT NOT NULL DEFAULT 'B',
ADD COLUMN     "governate" TEXT,
ADD COLUMN     "street" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "etaError" TEXT,
ADD COLUMN     "etaLongId" TEXT,
ADD COLUMN     "etaSentAt" TIMESTAMP(3),
ADD COLUMN     "etaStatus" "EtaStatus" NOT NULL DEFAULT 'NOT_SENT',
ADD COLUMN     "etaSubmissionUuid" TEXT,
ADD COLUMN     "etaUuid" TEXT;

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "etaItemCode" TEXT,
ADD COLUMN     "etaItemType" TEXT NOT NULL DEFAULT 'EGS';

-- CreateTable
CREATE TABLE "EtaSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "taxId" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT 'VIOCHEM',
    "activityCode" TEXT NOT NULL DEFAULT '',
    "branchId" TEXT NOT NULL DEFAULT '0',
    "governate" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "street" TEXT NOT NULL DEFAULT '',
    "buildingNo" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT,
    "documentVersion" TEXT NOT NULL DEFAULT '1.0',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EtaSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_etaUuid_key" ON "Invoice"("etaUuid");

