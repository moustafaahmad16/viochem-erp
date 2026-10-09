import { db } from "@/lib/db";
import { addDays, today } from "@/lib/dates";
import { UserError } from "./errors";
import { nextNumber } from "./numbering";

/** How long a quotation stays valid when no date is given. */
export const DEFAULT_VALID_DAYS = 30;

/** An open quotation whose valid-until date has passed. It can still be turned into an invoice. */
export function isExpired(q: { status: string; validUntil: Date | null }, on: Date = today()) {
  return q.status === "OPEN" && q.validUntil !== null && q.validUntil < on;
}

async function open(id: number) {
  const q = await db.quote.findUniqueOrThrow({ where: { id } });
  if (q.status !== "OPEN") throw new UserError("Only open quotations can be changed.");
  return q;
}

function checkValidity(date: Date, validUntil: Date) {
  if (validUntil < date) throw new UserError("Valid until can't be before the quotation date.");
}

export async function createQuote(customerId: number, date: Date, validUntil: Date | null = null) {
  const until = validUntil ?? addDays(date, DEFAULT_VALID_DAYS);
  checkValidity(date, until);
  return db.$transaction(async (tx) =>
    tx.quote.create({ data: { number: await nextNumber(tx, "QUO", date), customerId, date, validUntil: until } }),
  );
}

export async function updateQuote(
  id: number,
  data: { customerId: number; date: Date; validUntil: Date | null; vatRate: string; notes: string | null },
) {
  await open(id);
  if (data.validUntil) checkValidity(data.date, data.validUntil);
  return db.quote.update({ where: { id }, data });
}

export async function addQuoteLine(id: number, line: { itemId: number; qty: string; unitPrice: string }) {
  await open(id);
  return db.quoteLine.create({ data: { quoteId: id, ...line } });
}

export async function removeQuoteLine(id: number, lineId: number) {
  await open(id);
  await db.quoteLine.delete({ where: { id: lineId, quoteId: id } });
}

export async function declineQuote(id: number) {
  await open(id);
  return db.quote.update({ where: { id }, data: { status: "DECLINED" } });
}

export async function reopenQuote(id: number) {
  const q = await db.quote.findUniqueOrThrow({ where: { id } });
  if (q.status !== "DECLINED") throw new UserError("Only declined quotations can be reopened.");
  return db.quote.update({ where: { id }, data: { status: "OPEN" } });
}

export async function deleteQuote(id: number) {
  await open(id);
  await db.quote.delete({ where: { id } });
}

/** Make a draft invoice with the quotation's products and prices, and mark the quotation accepted. */
export async function quoteToInvoice(quoteId: number) {
  return db.$transaction(async (tx) => {
    const q = await tx.quote.findUniqueOrThrow({ where: { id: quoteId }, include: { lines: { orderBy: { id: "asc" } } } });
    if (q.status !== "OPEN") throw new UserError("Only open quotations can be turned into an invoice.");
    if (!q.lines.length) throw new UserError("Add products to the quotation before turning it into an invoice.");
    const date = today();
    const invoice = await tx.invoice.create({
      data: {
        number: await nextNumber(tx, "INV", date),
        customerId: q.customerId,
        date,
        vatRate: q.vatRate,
        notes: q.notes,
        lines: { create: q.lines.map((l) => ({ itemId: l.itemId, lotId: null, qty: l.qty, unitPrice: l.unitPrice })) },
      },
    });
    // Only flip it if still open, so two people converting at once can't both succeed.
    const { count } = await tx.quote.updateMany({ where: { id: quoteId, status: "OPEN" }, data: { status: "ACCEPTED", invoiceId: invoice.id } });
    if (count !== 1) throw new UserError("Only open quotations can be turned into an invoice.");
    return invoice;
  });
}
