import type { InvoiceKind } from "@prisma/client";
import { db } from "@/lib/db";
import { addDays, today } from "@/lib/dates";
import { UserError } from "./errors";
import { draftNumber } from "./invoice-numbers";
import { nextNumber } from "./numbering";
import { shortages } from "./reservations";

/** How long a quotation stays valid when no date is given. */
export const DEFAULT_VALID_DAYS = 30;

/**
 * An open or confirmed quotation whose valid-until date has passed. A confirmed one stops reserving
 * its products then. Either can still be turned into an invoice.
 */
export function isExpired(q: { status: string; validUntil: Date | null }, on: Date = today()) {
  return (q.status === "OPEN" || q.status === "CONFIRMED") && q.validUntil !== null && q.validUntil < on;
}

async function open(id: number) {
  const q = await db.quote.findUniqueOrThrow({ where: { id } });
  if (q.status !== "OPEN") throw new UserError("Only open quotations can be changed.");
  return q;
}

function checkValidity(date: Date, validUntil: Date) {
  if (validUntil < date) throw new UserError("Valid until can't be before the quotation date.");
}

/** A taxed quotation adds 14% VAT; a non-taxed one adds none. */
export async function createQuote(customerId: number, date: Date, validUntil: Date | null = null, kind: InvoiceKind = "TAXED") {
  const until = validUntil ?? addDays(date, DEFAULT_VALID_DAYS);
  checkValidity(date, until);
  return db.$transaction(async (tx) =>
    tx.quote.create({ data: { number: await nextNumber(tx, "QUO", date), customerId, date, validUntil: until, kind, vatRate: kind === "NON_TAXED" ? 0 : 14 } }),
  );
}

export async function updateQuote(
  id: number,
  data: { customerId: number; date: Date; validUntil: Date | null; kind?: InvoiceKind; vatRate?: string | null; notes: string | null },
) {
  await open(id);
  if (data.validUntil) checkValidity(data.date, data.validUntil);
  const kind = data.kind ?? "TAXED";
  // Non-taxed carries no VAT; switching back to taxed brings back the usual 14%.
  const vatRate = kind === "NON_TAXED" ? "0" : (data.vatRate ?? "14");
  return db.quote.update({ where: { id }, data: { ...data, kind, vatRate } });
}

export async function addQuoteLine(id: number, line: { itemId: number; qty: string; unitPrice: string }) {
  await open(id);
  return db.quoteLine.create({ data: { quoteId: id, ...line } });
}

export async function updateQuoteLine(id: number, lineId: number, line: { qty: string; unitPrice: string }) {
  await open(id);
  await db.quoteLine.update({ where: { id: lineId, quoteId: id }, data: line });
}

export async function removeQuoteLine(id: number, lineId: number) {
  await open(id);
  await db.quoteLine.delete({ where: { id: lineId, quoteId: id } });
}

/**
 * The customer agreed: reserve the quotation's products until its valid-until date. Refused when
 * there isn't enough free stock, unless the caller allows it (an admin promising stock still to come).
 */
export async function confirmQuote(id: number, opts: { allowShort?: boolean } = {}) {
  const q = await open(id);
  const lines = await db.quoteLine.findMany({ where: { quoteId: id }, include: { item: true } });
  if (!lines.length) throw new UserError("Add products to the quotation before confirming it.");
  if (isExpired(q)) throw new UserError("This quotation's valid-until date has passed. Change it before confirming.");
  const short = await shortages(lines, { quoteId: id });
  if (short.length && !opts.allowShort) throw new ShortError(short);
  const { count } = await db.quote.updateMany({ where: { id, status: "OPEN" }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
  if (count !== 1) throw new UserError("Only open quotations can be changed.");
  return short;
}

/** Not enough free stock. The messages say which products and by how much. */
export class ShortError extends UserError {
  constructor(public shortages: string[]) {
    super(shortages.join("\n"));
  }
}

/** Back to open so it can be changed. Its products stop being reserved until it is confirmed again. */
export async function editQuote(id: number) {
  const { count } = await db.quote.updateMany({ where: { id, status: "CONFIRMED" }, data: { status: "OPEN", confirmedAt: null } });
  if (count !== 1) throw new UserError("Only confirmed quotations can be reopened for changes.");
}

/** The customer said no. A confirmed quotation's reservation ends. */
export async function declineQuote(id: number) {
  const { count } = await db.quote.updateMany({ where: { id, status: { in: ["OPEN", "CONFIRMED"] } }, data: { status: "DECLINED", confirmedAt: null } });
  if (count !== 1) throw new UserError("Only open quotations can be changed.");
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

/**
 * Make a draft invoice, taxed or not, with the quotation's products and prices, and mark the
 * quotation accepted. The draft now holds the reservation, and its quantities and prices can still change.
 */
export async function quoteToInvoice(quoteId: number, as?: InvoiceKind) {
  return db.$transaction(async (tx) => {
    const q = await tx.quote.findUniqueOrThrow({ where: { id: quoteId }, include: { lines: { orderBy: { id: "asc" } } } });
    if (q.status !== "OPEN" && q.status !== "CONFIRMED") throw new UserError("Only open quotations can be turned into an invoice.");
    if (!q.lines.length) throw new UserError("Add products to the quotation before turning it into an invoice.");
    const kind = as ?? q.kind;
    const date = today();
    const created = await tx.invoice.create({
      data: {
        number: `${draftNumber(0)}-${crypto.randomUUID()}`,
        kind,
        customerId: q.customerId,
        date,
        vatRate: kind === "NON_TAXED" ? 0 : q.vatRate,
        notes: q.notes,
        lines: { create: q.lines.map((l) => ({ itemId: l.itemId, lotId: null, qty: l.qty, unitPrice: l.unitPrice })) },
      },
    });
    const invoice = await tx.invoice.update({ where: { id: created.id }, data: { number: draftNumber(created.id) } });
    // Only flip it if unchanged, so two people converting at once can't both succeed.
    const { count } = await tx.quote.updateMany({ where: { id: quoteId, status: q.status }, data: { status: "ACCEPTED", invoiceId: invoice.id } });
    if (count !== 1) throw new UserError("Only open quotations can be turned into an invoice.");
    return invoice;
  });
}
