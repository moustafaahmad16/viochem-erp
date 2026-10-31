-- Quotations are taxed (with VAT) or non-taxed, like invoices.
ALTER TABLE "Quote" ADD COLUMN "kind" "InvoiceKind" NOT NULL DEFAULT 'TAXED';
