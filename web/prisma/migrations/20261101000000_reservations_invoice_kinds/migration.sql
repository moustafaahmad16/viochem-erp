-- A confirmed quotation reserves its products until its valid-until date.
ALTER TYPE "QuoteStatus" ADD VALUE 'CONFIRMED';
ALTER TABLE "Quote" ADD COLUMN "confirmedAt" TIMESTAMP(3);

-- Taxed and non-taxed invoices.
CREATE TYPE "InvoiceKind" AS ENUM ('TAXED', 'NON_TAXED');
ALTER TABLE "Invoice" ADD COLUMN "kind" "InvoiceKind" NOT NULL DEFAULT 'TAXED';

-- Non-taxed sales are kept apart from taxed ones.
INSERT INTO "LedgerAccount" ("code", "name", "section", "system") VALUES ('4120', 'Sales (non-taxed)', 'REVENUE', false)
  ON CONFLICT ("code") DO NOTHING;
