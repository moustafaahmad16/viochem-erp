-- CreateTable
CREATE TABLE "CustomerRequest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "number" TEXT NOT NULL,
    "customerId" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "quoteId" INTEGER,
    "convertedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CustomerRequest_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomerRequestLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "requestId" INTEGER NOT NULL,
    "itemId" INTEGER,
    "productName" TEXT,
    "casNumber" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'kg',
    "qty" DECIMAL NOT NULL,
    "notes" TEXT,
    "quotedQty" DECIMAL,
    "gapQty" DECIMAL,
    "gapClosedAt" DATETIME,
    CONSTRAINT "CustomerRequestLine_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CustomerRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomerRequestLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerRequest_number_key" ON "CustomerRequest"("number");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerRequest_quoteId_key" ON "CustomerRequest"("quoteId");

-- CreateIndex
CREATE INDEX "CustomerRequest_date_idx" ON "CustomerRequest"("date");

