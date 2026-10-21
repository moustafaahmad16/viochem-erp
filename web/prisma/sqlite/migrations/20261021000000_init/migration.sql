-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'STAFF',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Counter" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Item" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "casNumber" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'kg',
    "hazardClass" TEXT,
    "notes" TEXT,
    "etaItemCode" TEXT,
    "etaItemType" TEXT NOT NULL DEFAULT 'EGS',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "minQty" DECIMAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 0,
    "openingBalance" DECIMAL NOT NULL DEFAULT 0,
    "openingBalanceDate" DATETIME,
    "openingFxRate" DECIMAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "taxId" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "etaType" TEXT NOT NULL DEFAULT 'B',
    "country" TEXT NOT NULL DEFAULT 'EG',
    "governate" TEXT,
    "city" TEXT,
    "street" TEXT,
    "buildingNo" TEXT,
    "notes" TEXT,
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 30,
    "openingBalance" DECIMAL NOT NULL DEFAULT 0,
    "openingBalanceDate" DATETIME,
    "creditLimit" DECIMAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ref" TEXT NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "supplierInvoiceNo" TEXT,
    "currency" TEXT NOT NULL,
    "fxRate" DECIMAL NOT NULL,
    "allocation" TEXT NOT NULL DEFAULT 'VALUE',
    "orderDate" DATETIME NOT NULL,
    "etd" DATETIME,
    "eta" DATETIME,
    "arrivalDate" DATETIME,
    "dueDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ORDERED',
    "notes" TEXT,
    "purchaseOrderId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Shipment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Shipment_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShipmentLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shipmentId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "qty" DECIMAL NOT NULL,
    "unitPrice" DECIMAL NOT NULL,
    "supplierBatchNo" TEXT,
    "expiryDate" DATETIME,
    "orderLineId" INTEGER,
    CONSTRAINT "ShipmentLine_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShipmentLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShipmentLine_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "PurchaseOrderLine" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShipmentCharge" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shipmentId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT,
    "amountEgp" DECIMAL NOT NULL,
    "date" DATETIME,
    "accountId" INTEGER,
    CONSTRAINT "ShipmentCharge_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShipmentCharge_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MoneyAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Lot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lotNo" TEXT NOT NULL,
    "itemId" INTEGER NOT NULL,
    "shipmentLineId" INTEGER,
    "receivedDate" DATETIME NOT NULL,
    "qtyReceived" DECIMAL NOT NULL,
    "qtyOnHand" DECIMAL NOT NULL,
    "unitCostEgp" DECIMAL NOT NULL,
    "expiryDate" DATETIME,
    "supplierBatchNo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Lot_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lot_shipmentLineId_fkey" FOREIGN KEY ("shipmentLineId") REFERENCES "ShipmentLine" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StockMove" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lotId" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "kind" TEXT NOT NULL,
    "qty" DECIMAL NOT NULL,
    "unitCostEgp" DECIMAL NOT NULL,
    "invoiceLineId" INTEGER,
    "creditLineId" INTEGER,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockMove_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockMove_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "InvoiceLine" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StockMove_creditLineId_fkey" FOREIGN KEY ("creditLineId") REFERENCES "CreditNoteLine" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "number" TEXT NOT NULL,
    "customerId" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "dueDate" DATETIME,
    "etaStatus" TEXT NOT NULL DEFAULT 'NOT_SENT',
    "etaUuid" TEXT,
    "etaLongId" TEXT,
    "etaSubmissionUuid" TEXT,
    "etaError" TEXT,
    "etaSentAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "vatRate" DECIMAL NOT NULL DEFAULT 14,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedAt" DATETIME,
    CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoiceId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "lotId" INTEGER,
    "qty" DECIMAL NOT NULL,
    "unitPrice" DECIMAL NOT NULL,
    CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvoiceLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InvoiceLine_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomerPayment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "number" TEXT NOT NULL,
    "customerId" INTEGER NOT NULL,
    "invoiceId" INTEGER,
    "accountId" INTEGER,
    "date" DATETIME NOT NULL,
    "amount" DECIMAL NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerPayment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CustomerPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CustomerPayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MoneyAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupplierPayment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "number" TEXT NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "shipmentId" INTEGER,
    "accountId" INTEGER,
    "date" DATETIME NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "fxRate" DECIMAL NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierPayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SupplierPayment_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SupplierPayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MoneyAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MoneyAccount" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'BANK',
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "openingBalance" DECIMAL NOT NULL DEFAULT 0,
    "openingDate" DATETIME,
    "openingFxRate" DECIMAL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "number" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "payee" TEXT,
    "amount" DECIMAL NOT NULL,
    "vat" DECIMAL NOT NULL DEFAULT 0,
    "accountId" INTEGER,
    "reference" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Expense_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MoneyAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL,
    "fromAccountId" INTEGER NOT NULL,
    "toAccountId" INTEGER NOT NULL,
    "amount" DECIMAL NOT NULL,
    "toAmount" DECIMAL NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transfer_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "MoneyAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transfer_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "MoneyAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EtaSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
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
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "number" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "memo" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "entryId" INTEGER NOT NULL,
    "ledgerAccountId" INTEGER,
    "moneyAccountId" INTEGER,
    "debit" DECIMAL NOT NULL DEFAULT 0,
    "credit" DECIMAL NOT NULL DEFAULT 0,
    "memo" TEXT,
    CONSTRAINT "JournalLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JournalLine_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "LedgerAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "JournalLine_moneyAccountId_fkey" FOREIGN KEY ("moneyAccountId") REFERENCES "MoneyAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "number" TEXT NOT NULL,
    "customerId" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "validUntil" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "vatRate" DECIMAL NOT NULL DEFAULT 14,
    "notes" TEXT,
    "invoiceId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Quote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Quote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuoteLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "quoteId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "qty" DECIMAL NOT NULL,
    "unitPrice" DECIMAL NOT NULL,
    CONSTRAINT "QuoteLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuoteLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "number" TEXT NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "vatRate" DECIMAL NOT NULL,
    "etaStatus" TEXT NOT NULL DEFAULT 'NOT_SENT',
    "etaUuid" TEXT,
    "etaLongId" TEXT,
    "etaSubmissionUuid" TEXT,
    "etaError" TEXT,
    "etaSentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedAt" DATETIME,
    CONSTRAINT "CreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CreditNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CreditNoteLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "creditNoteId" INTEGER NOT NULL,
    "invoiceLineId" INTEGER NOT NULL,
    "qty" DECIMAL NOT NULL,
    "unitPrice" DECIMAL NOT NULL,
    "restock" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "CreditNoteLine_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "CreditNote" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CreditNoteLine_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "InvoiceLine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "number" TEXT NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "expectedDate" DATETIME,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PurchaseOrderLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "qty" DECIMAL NOT NULL,
    "unitPrice" DECIMAL NOT NULL,
    CONSTRAINT "PurchaseOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PurchaseOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PurchaseOrderLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Cheque" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "number" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "chequeNo" TEXT NOT NULL,
    "bank" TEXT,
    "customerId" INTEGER,
    "supplierId" INTEGER,
    "invoiceId" INTEGER,
    "shipmentId" INTEGER,
    "date" DATETIME NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "amount" DECIMAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "accountId" INTEGER,
    "depositedOn" DATETIME,
    "clearedOn" DATETIME,
    "bouncedOn" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Cheque_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Cheque_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Cheque_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Cheque_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Cheque_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MoneyAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Rfq" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "number" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "replyBy" DATETIME,
    "neededBy" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RfqLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "rfqId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "qty" DECIMAL NOT NULL,
    "notes" TEXT,
    CONSTRAINT "RfqLine_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RfqLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RfqSupplier" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "rfqId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "sentAt" DATETIME,
    "repliedAt" DATETIME,
    CONSTRAINT "RfqSupplier_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RfqSupplier_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RfqQuote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "rfqId" INTEGER NOT NULL,
    "rfqLineId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "unitPrice" DECIMAL NOT NULL,
    "moq" DECIMAL,
    "leadTimeDays" INTEGER,
    "paymentTermsDays" INTEGER,
    "validUntil" DATETIME,
    "incoterm" TEXT,
    "notes" TEXT,
    "awardQty" DECIMAL,
    "purchaseOrderId" INTEGER,
    CONSTRAINT "RfqQuote_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RfqQuote_rfqLineId_fkey" FOREIGN KEY ("rfqLineId") REFERENCES "RfqLine" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RfqQuote_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RfqQuote_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RfqRate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "rfqId" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "rate" DECIMAL NOT NULL,
    CONSTRAINT "RfqRate_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Item_code_key" ON "Item"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_name_key" ON "Supplier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_name_key" ON "Customer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_ref_key" ON "Shipment"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "Lot_lotNo_key" ON "Lot"("lotNo");

-- CreateIndex
CREATE UNIQUE INDEX "Lot_shipmentLineId_key" ON "Lot"("shipmentLineId");

-- CreateIndex
CREATE INDEX "StockMove_lotId_idx" ON "StockMove"("lotId");

-- CreateIndex
CREATE INDEX "StockMove_date_idx" ON "StockMove"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_etaUuid_key" ON "Invoice"("etaUuid");

-- CreateIndex
CREATE INDEX "Invoice_date_idx" ON "Invoice"("date");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPayment_number_key" ON "CustomerPayment"("number");

-- CreateIndex
CREATE INDEX "CustomerPayment_customerId_idx" ON "CustomerPayment"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPayment_number_key" ON "SupplierPayment"("number");

-- CreateIndex
CREATE INDEX "SupplierPayment_supplierId_idx" ON "SupplierPayment"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "MoneyAccount_name_key" ON "MoneyAccount"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_number_key" ON "Expense"("number");

-- CreateIndex
CREATE INDEX "Expense_date_idx" ON "Expense"("date");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_code_key" ON "LedgerAccount"("code");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_number_key" ON "JournalEntry"("number");

-- CreateIndex
CREATE INDEX "JournalLine_entryId_idx" ON "JournalLine"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_number_key" ON "Quote"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_invoiceId_key" ON "Quote"("invoiceId");

-- CreateIndex
CREATE INDEX "Quote_date_idx" ON "Quote"("date");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_number_key" ON "CreditNote"("number");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_etaUuid_key" ON "CreditNote"("etaUuid");

-- CreateIndex
CREATE INDEX "CreditNote_invoiceId_idx" ON "CreditNote"("invoiceId");

-- CreateIndex
CREATE INDEX "CreditNote_date_idx" ON "CreditNote"("date");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_number_key" ON "PurchaseOrder"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Cheque_number_key" ON "Cheque"("number");

-- CreateIndex
CREATE INDEX "Cheque_dueDate_idx" ON "Cheque"("dueDate");

-- CreateIndex
CREATE INDEX "Cheque_customerId_idx" ON "Cheque"("customerId");

-- CreateIndex
CREATE INDEX "Cheque_supplierId_idx" ON "Cheque"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "Rfq_number_key" ON "Rfq"("number");

-- CreateIndex
CREATE UNIQUE INDEX "RfqSupplier_rfqId_supplierId_key" ON "RfqSupplier"("rfqId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "RfqQuote_rfqLineId_supplierId_key" ON "RfqQuote"("rfqLineId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "RfqRate_rfqId_currency_key" ON "RfqRate"("rfqId", "currency");


-- Default chart of accounts
INSERT INTO "LedgerAccount" ("code", "name", "section", "system") VALUES
  ('1190', 'Money not assigned to an account', 'CURRENT_ASSETS', false),
  ('1210', 'Customers', 'CURRENT_ASSETS', true),
  ('1310', 'Stock', 'CURRENT_ASSETS', true),
  ('1320', 'Goods in transit', 'CURRENT_ASSETS', true),
  ('1410', 'VAT paid on purchases', 'CURRENT_ASSETS', false),
  ('1420', 'Advances and prepayments', 'CURRENT_ASSETS', false),
  ('1430', 'Tax withheld by customers', 'CURRENT_ASSETS', false),
  ('1510', 'Property and equipment', 'FIXED_ASSETS', false),
  ('1520', 'Accumulated depreciation', 'FIXED_ASSETS', false),
  ('2110', 'Suppliers', 'CURRENT_LIABILITIES', true),
  ('2210', 'VAT on sales', 'CURRENT_LIABILITIES', false),
  ('2220', 'Withholding tax payable', 'CURRENT_LIABILITIES', false),
  ('2230', 'Income tax payable', 'CURRENT_LIABILITIES', false),
  ('2240', 'Social insurance payable', 'CURRENT_LIABILITIES', false),
  ('2310', 'Accrued expenses', 'CURRENT_LIABILITIES', false),
  ('2410', 'Short-term loans', 'CURRENT_LIABILITIES', false),
  ('2510', 'Long-term loans', 'LONG_TERM_LIABILITIES', false),
  ('3100', 'Capital', 'EQUITY', false),
  ('3200', 'Retained earnings', 'EQUITY', false),
  ('3300', 'Partners'' current accounts', 'EQUITY', false),
  ('3900', 'Opening balances', 'EQUITY', false),
  ('4100', 'Sales', 'REVENUE', false),
  ('4900', 'Other income', 'OTHER_INCOME', false),
  ('5100', 'Cost of goods sold', 'COST_OF_SALES', false),
  ('5200', 'Stock count differences', 'COST_OF_SALES', false),
  ('6101', 'Transport to customers', 'SELLING', false),
  ('6102', 'Sales commissions', 'SELLING', false),
  ('6103', 'Marketing', 'SELLING', false),
  ('6104', 'Exhibitions and samples', 'SELLING', false),
  ('6105', 'Lab tests and certificates', 'SELLING', false),
  ('6106', 'Packaging', 'SELLING', false),
  ('6107', 'Courier', 'SELLING', false),
  ('6201', 'Salaries', 'ADMIN', false),
  ('6202', 'Social insurance', 'ADMIN', false),
  ('6203', 'Rent', 'ADMIN', false),
  ('6204', 'Electricity and water', 'ADMIN', false),
  ('6205', 'Phone and internet', 'ADMIN', false),
  ('6206', 'Warehouse', 'ADMIN', false),
  ('6207', 'Vehicles and fuel', 'ADMIN', false),
  ('6208', 'Travel', 'ADMIN', false),
  ('6209', 'Insurance', 'ADMIN', false),
  ('6210', 'Office supplies', 'ADMIN', false),
  ('6211', 'Software and subscriptions', 'ADMIN', false),
  ('6212', 'Professional fees', 'ADMIN', false),
  ('6213', 'Government fees', 'ADMIN', false),
  ('6214', 'Maintenance', 'ADMIN', false),
  ('6215', 'Cleaning and security', 'ADMIN', false),
  ('6216', 'Hospitality', 'ADMIN', false),
  ('6217', 'Training', 'ADMIN', false),
  ('6218', 'Donations', 'ADMIN', false),
  ('6219', 'Depreciation', 'ADMIN', false),
  ('6220', 'Other', 'ADMIN', false),
  ('6301', 'Bank charges', 'FINANCE', false),
  ('6302', 'Loan interest', 'FINANCE', false),
  ('6350', 'Exchange differences', 'FINANCE', false),
  ('7100', 'Income tax', 'INCOME_TAX', false),
  ('1220', 'Cheques received, not yet cleared', 'CURRENT_ASSETS', true),
  ('2120', 'Cheques issued, not yet cashed', 'CURRENT_LIABILITIES', true),
  ('4110', 'Sales returns and allowances', 'REVENUE', true);
