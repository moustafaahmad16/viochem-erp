-- CreateEnum
CREATE TYPE "CustomerRequestStatus" AS ENUM ('OPEN', 'CONVERTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "CustomerRequest" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "status" "CustomerRequestStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "quoteId" INTEGER,
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerRequestLine" (
    "id" SERIAL NOT NULL,
    "requestId" INTEGER NOT NULL,
    "itemId" INTEGER,
    "productName" TEXT,
    "casNumber" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'kg',
    "qty" DECIMAL(14,3) NOT NULL,
    "notes" TEXT,
    "quotedQty" DECIMAL(14,3),
    "gapQty" DECIMAL(14,3),
    "gapClosedAt" TIMESTAMP(3),

    CONSTRAINT "CustomerRequestLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerRequest_number_key" ON "CustomerRequest"("number");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerRequest_quoteId_key" ON "CustomerRequest"("quoteId");

-- CreateIndex
CREATE INDEX "CustomerRequest_date_idx" ON "CustomerRequest"("date");

-- AddForeignKey
ALTER TABLE "CustomerRequest" ADD CONSTRAINT "CustomerRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRequest" ADD CONSTRAINT "CustomerRequest_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRequestLine" ADD CONSTRAINT "CustomerRequestLine_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CustomerRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRequestLine" ADD CONSTRAINT "CustomerRequestLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

