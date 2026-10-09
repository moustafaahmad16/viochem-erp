-- CreateEnum
CREATE TYPE "LedgerSection" AS ENUM ('CURRENT_ASSETS', 'FIXED_ASSETS', 'CURRENT_LIABILITIES', 'LONG_TERM_LIABILITIES', 'EQUITY', 'REVENUE', 'COST_OF_SALES', 'SELLING', 'ADMIN', 'FINANCE', 'OTHER_INCOME', 'INCOME_TAX');

-- AlterTable
ALTER TABLE "MoneyAccount" ADD COLUMN     "openingFxRate" DECIMAL(14,6);

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "openingFxRate" DECIMAL(14,6);

-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "section" "LedgerSection" NOT NULL,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "memo" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" SERIAL NOT NULL,
    "entryId" INTEGER NOT NULL,
    "ledgerAccountId" INTEGER,
    "moneyAccountId" INTEGER,
    "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "memo" TEXT,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_code_key" ON "LedgerAccount"("code");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_number_key" ON "JournalEntry"("number");

-- CreateIndex
CREATE INDEX "JournalLine_entryId_idx" ON "JournalLine"("entryId");

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "LedgerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_moneyAccountId_fkey" FOREIGN KEY ("moneyAccountId") REFERENCES "MoneyAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;


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
  ('7100', 'Income tax', 'INCOME_TAX', false);
