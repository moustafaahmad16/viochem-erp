import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { today } from "@/lib/dates";

/**
 * Reserved stock. A confirmed quotation holds its products until its valid-until date, and a draft
 * invoice (taxed or not) holds its products until it is posted or deleted. Nothing leaves the
 * batches until an invoice is posted; reserving only lowers what is free to promise to others.
 */

const dec = (v: { toString(): string } | null | undefined) => new Decimal(v?.toString() ?? 0);
const ZERO = new Decimal(0);

/** avgCost is the landed cost per unit of what is on hand, weighted by quantity; null when there is none. */
export type Availability = { onHand: Decimal; reserved: Decimal; free: Decimal; avgCost: Decimal | null };

type Except = { quoteId?: number; invoiceId?: number };

/** Quotations that reserve stock on a date: confirmed, and not past their valid-until date. */
export const reservingQuote = (on: Date = today(), quoteId?: number) => ({
  status: "CONFIRMED" as const,
  OR: [{ validUntil: null }, { validUntil: { gte: on } }],
  ...(quoteId ? { id: { not: quoteId } } : {}),
});

/** On hand (batches not yet expired), reserved, and free for each product, leaving out the given quotation or invoice. */
export async function availability(itemIds?: number[], except: Except = {}, on: Date = today()): Promise<Map<number, Availability>> {
  const itemId = itemIds ? { in: itemIds } : undefined;
  const [stock, quoted, drafts] = await Promise.all([
    db.lot.findMany({ where: { itemId, qtyOnHand: { gt: 0 }, OR: [{ expiryDate: null }, { expiryDate: { gte: on } }] }, select: { itemId: true, qtyOnHand: true, unitCostEgp: true } }),
    db.quoteLine.groupBy({ by: ["itemId"], where: { itemId, quote: reservingQuote(on, except.quoteId) }, _sum: { qty: true } }),
    db.invoiceLine.groupBy({ by: ["itemId"], where: { itemId, invoice: { status: "DRAFT", ...(except.invoiceId ? { id: { not: except.invoiceId } } : {}) } }, _sum: { qty: true } }),
  ]);
  const ids = new Set([...(itemIds ?? []), ...stock.map((s) => s.itemId), ...quoted.map((q) => q.itemId), ...drafts.map((d) => d.itemId)]);
  const result = new Map<number, Availability>();
  for (const id of ids) {
    const lots = stock.filter((s) => s.itemId === id);
    const onHand = lots.reduce((s, l) => s.plus(dec(l.qtyOnHand)), ZERO);
    const value = lots.reduce((s, l) => s.plus(dec(l.qtyOnHand).times(dec(l.unitCostEgp))), ZERO);
    const reserved = dec(quoted.find((q) => q.itemId === id)?._sum.qty).plus(dec(drafts.find((d) => d.itemId === id)?._sum.qty));
    result.set(id, { onHand, reserved, free: onHand.minus(reserved), avgCost: onHand.gt(0) ? value.div(onHand) : null });
  }
  return result;
}

export const NOTHING: Availability = { onHand: ZERO, reserved: ZERO, free: ZERO, avgCost: null };

/**
 * Products on a quotation or invoice asking for more than is free, as messages. Lines of the same
 * product are added up first.
 */
export async function shortages(lines: { itemId: number; qty: { toString(): string }; item: { name: string; unit: string } }[], except: Except = {}, on: Date = today()) {
  const wanted = new Map<number, { qty: Decimal; name: string; unit: string }>();
  for (const l of lines) {
    const w = wanted.get(l.itemId) ?? { qty: ZERO, name: l.item.name, unit: l.item.unit };
    wanted.set(l.itemId, { ...w, qty: w.qty.plus(dec(l.qty)) });
  }
  const free = await availability([...wanted.keys()], except, on);
  return [...wanted].flatMap(([id, w]) => {
    const a = free.get(id) ?? NOTHING;
    if (w.qty.lte(a.free)) return [];
    return [`Only ${Decimal.max(a.free, 0).toString()} ${w.unit} of ${w.name} is free (${a.onHand.toString()} ${w.unit} on hand, ${a.reserved.toString()} ${w.unit} reserved), but ${w.qty.toString()} ${w.unit} is needed.`];
  });
}

/** Who is holding a product: confirmed quotations and draft invoices, oldest first. */
export async function reservationsFor(itemId: number, on: Date = today()) {
  const [quotes, invoices] = await Promise.all([
    db.quoteLine.findMany({ where: { itemId, quote: reservingQuote(on) }, include: { quote: { include: { customer: true } } } }),
    db.invoiceLine.findMany({ where: { itemId, invoice: { status: "DRAFT" } }, include: { invoice: { include: { customer: true } } } }),
  ]);
  return [
    ...quotes.map((l) => ({ key: `q${l.id}`, kind: "quote" as const, href: `/quotes/${l.quoteId}`, number: l.quote.number, customer: l.quote.customer.name, date: l.quote.date, until: l.quote.validUntil, qty: dec(l.qty) })),
    ...invoices.map((l) => ({ key: `i${l.id}`, kind: "invoice" as const, href: `/invoices/${l.invoiceId}`, number: l.invoice.number, customer: l.invoice.customer.name, date: l.invoice.date, until: null, qty: dec(l.qty) })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());
}
