-- A confirmed quotation reserves its products until its valid-until date.
ALTER TABLE "Quote" ADD COLUMN "confirmedAt" DATETIME;

-- Taxed and non-taxed invoices. Added in place: rebuilding the Invoice table would take its lines with it.
ALTER TABLE "Invoice" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'TAXED';

-- Non-taxed sales are kept apart from taxed ones.
INSERT OR IGNORE INTO "LedgerAccount" ("code", "name", "section", "system") VALUES ('4120', 'Sales (non-taxed)', 'REVENUE', false);
