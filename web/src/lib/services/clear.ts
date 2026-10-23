import { db, type Tx } from "@/lib/db";

/**
 * Deletes everything entered: products, customers, suppliers, every document, payment and stock record,
 * bank and cash accounts, and restarts the numbering. Users, e-invoice settings and the chart of
 * accounts stay, so the business can start again straight away.
 */
export async function clearAllData(tx: Tx) {
  // Children before the records they point to.
  await tx.rfqRate.deleteMany();
  await tx.rfqQuote.deleteMany();
  await tx.rfqSupplier.deleteMany();
  await tx.rfqLine.deleteMany();
  await tx.rfq.deleteMany();
  await tx.cheque.deleteMany();
  await tx.journalLine.deleteMany();
  await tx.journalEntry.deleteMany();
  await tx.creditNoteLine.deleteMany();
  await tx.creditNote.deleteMany();
  await tx.quoteLine.deleteMany();
  await tx.quote.deleteMany();
  await tx.customerPayment.deleteMany();
  await tx.supplierPayment.deleteMany();
  await tx.expense.deleteMany();
  await tx.transfer.deleteMany();
  await tx.stockMove.deleteMany();
  await tx.invoiceLine.deleteMany();
  await tx.invoice.deleteMany();
  await tx.lot.deleteMany();
  await tx.shipmentDocument.deleteMany();
  await tx.shipmentCharge.deleteMany();
  await tx.shipmentLine.deleteMany();
  await tx.shipment.deleteMany();
  await tx.purchaseOrderLine.deleteMany();
  await tx.purchaseOrder.deleteMany();
  await tx.moneyAccount.deleteMany();
  await tx.item.deleteMany();
  await tx.customer.deleteMany();
  await tx.supplier.deleteMany();
  await tx.documentType.deleteMany({ where: { builtIn: false } });
  await tx.counter.deleteMany();
}

export const clearAll = () => db.$transaction((tx) => clearAllData(tx), { timeout: 120_000 });
