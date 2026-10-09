-- CreateEnum
CREATE TYPE "RfqStatus" AS ENUM ('OPEN', 'ORDERED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Rfq" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "replyBy" DATE,
    "neededBy" DATE,
    "status" "RfqStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rfq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfqLine" (
    "id" SERIAL NOT NULL,
    "rfqId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "RfqLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfqSupplier" (
    "id" SERIAL NOT NULL,
    "rfqId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),

    CONSTRAINT "RfqSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfqQuote" (
    "id" SERIAL NOT NULL,
    "rfqId" INTEGER NOT NULL,
    "rfqLineId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "unitPrice" DECIMAL(14,4) NOT NULL,
    "moq" DECIMAL(14,3),
    "leadTimeDays" INTEGER,
    "paymentTermsDays" INTEGER,
    "validUntil" DATE,
    "incoterm" TEXT,
    "notes" TEXT,
    "awardQty" DECIMAL(14,3),
    "purchaseOrderId" INTEGER,

    CONSTRAINT "RfqQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfqRate" (
    "id" SERIAL NOT NULL,
    "rfqId" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "rate" DECIMAL(14,6) NOT NULL,

    CONSTRAINT "RfqRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Rfq_number_key" ON "Rfq"("number");

-- CreateIndex
CREATE UNIQUE INDEX "RfqSupplier_rfqId_supplierId_key" ON "RfqSupplier"("rfqId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "RfqQuote_rfqLineId_supplierId_key" ON "RfqQuote"("rfqLineId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "RfqRate_rfqId_currency_key" ON "RfqRate"("rfqId", "currency");

-- AddForeignKey
ALTER TABLE "RfqLine" ADD CONSTRAINT "RfqLine_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqLine" ADD CONSTRAINT "RfqLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqSupplier" ADD CONSTRAINT "RfqSupplier_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqSupplier" ADD CONSTRAINT "RfqSupplier_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqQuote" ADD CONSTRAINT "RfqQuote_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqQuote" ADD CONSTRAINT "RfqQuote_rfqLineId_fkey" FOREIGN KEY ("rfqLineId") REFERENCES "RfqLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqQuote" ADD CONSTRAINT "RfqQuote_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqQuote" ADD CONSTRAINT "RfqQuote_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqRate" ADD CONSTRAINT "RfqRate_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE CASCADE ON UPDATE CASCADE;

