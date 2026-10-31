-- Quotations are taxed (with VAT) or non-taxed, like invoices. Added in place, never by rebuilding the table.
ALTER TABLE "Quote" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'TAXED';
