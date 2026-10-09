-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CHEQUE');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "openingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "openingBalanceDate" DATE,
ADD COLUMN     "paymentTermsDays" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "dueDate" DATE;

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "dueDate" DATE;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "openingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "openingBalanceDate" DATE,
ADD COLUMN     "paymentTermsDays" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CustomerPayment" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" INTEGER NOT NULL,
    "invoiceId" INTEGER,
    "date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPayment" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "shipmentId" INTEGER,
    "date" DATE NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "fxRate" DECIMAL(14,6) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPayment_number_key" ON "CustomerPayment"("number");

-- CreateIndex
CREATE INDEX "CustomerPayment_customerId_idx" ON "CustomerPayment"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPayment_number_key" ON "SupplierPayment"("number");

-- CreateIndex
CREATE INDEX "SupplierPayment_supplierId_idx" ON "SupplierPayment"("supplierId");

-- AddForeignKey
ALTER TABLE "CustomerPayment" ADD CONSTRAINT "CustomerPayment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPayment" ADD CONSTRAINT "CustomerPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Invoices posted before payment terms existed fall due 30 days after their date.
UPDATE "Invoice" SET "dueDate" = "date" + 30 WHERE "status" <> 'DRAFT' AND "dueDate" IS NULL;
