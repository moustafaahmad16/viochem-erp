-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "hsCode" TEXT;

-- AlterTable
ALTER TABLE "Rfq" ADD COLUMN     "currency" TEXT,
ADD COLUMN     "incoterm" TEXT;
