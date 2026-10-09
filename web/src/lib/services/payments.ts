import Decimal from "decimal.js";
import type { PaymentMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { activeAccount, amountInAccount } from "./banking";
import { UserError } from "./errors";
import { nextNumber } from "./numbering";

export const METHODS: PaymentMethod[] = ["BANK_TRANSFER", "CASH", "CHEQUE"];

type Common = { date: Date; amount: string; method: PaymentMethod; reference: string | null; notes: string | null; accountId: number | null };

function checkCommon(p: Common) {
  if (new Decimal(p.amount).lte(0)) throw new UserError("Amount must be more than 0.");
  if (!METHODS.includes(p.method)) throw new UserError("Choose how it was paid.");
}

/** Money received from a customer, numbered RCV-YYYY-0001. */
export async function recordCustomerPayment(customerId: number, p: Common & { invoiceId: number | null }) {
  checkCommon(p);
  if (p.invoiceId) {
    const inv = await db.invoice.findUnique({ where: { id: p.invoiceId } });
    if (!inv || inv.customerId !== customerId) throw new UserError("That invoice is for a different customer.");
    if (inv.status !== "POSTED") throw new UserError(`${inv.number} isn't posted, so it can't be paid.`);
  }
  return db.$transaction(async (tx) => {
    await activeAccount(tx, p.accountId, { egpOnly: true });
    return tx.customerPayment.create({ data: { ...p, customerId, number: await nextNumber(tx, "RCV", p.date) } });
  });
}

/** Money paid to a supplier, numbered PAY-YYYY-0001. fxRate is EGP for one unit of the currency. */
export async function recordSupplierPayment(supplierId: number, p: Common & { shipmentId: number | null; currency: string; fxRate: string }) {
  checkCommon(p);
  const currency = p.currency.toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new UserError("Choose a currency.");
  const fxRate = currency === "EGP" ? "1" : p.fxRate;
  if (new Decimal(fxRate).lte(0)) throw new UserError("Exchange rate must be more than 0.");
  if (p.shipmentId) {
    const sh = await db.shipment.findUnique({ where: { id: p.shipmentId } });
    if (!sh || sh.supplierId !== supplierId) throw new UserError("That shipment is from a different supplier.");
    if (sh.currency !== currency) throw new UserError(`${sh.ref} is billed in ${sh.currency}, so pay it in ${sh.currency}.`);
  }
  return db.$transaction(async (tx) => {
    const account = await activeAccount(tx, p.accountId);
    if (account) amountInAccount(account, currency, p.amount, fxRate);
    return tx.supplierPayment.create({ data: { ...p, currency, fxRate, supplierId, number: await nextNumber(tx, "PAY", p.date) } });
  });
}
