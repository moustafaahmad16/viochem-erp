import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { today } from "@/lib/dates";

const addMonths = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));

export type PriceHint = {
  /** The last prices this customer paid, newest first. */
  lastToCustomer: { date: string; price: string; number: string }[];
  /** Average price to everyone over the last 6 months, for the "well under usual" warning. */
  usual: string | null;
  lastPurchase: { date: string; currency: string; unitPrice: string; ref: string } | null;
  /** Landed cost per unit of the newest batch received. */
  landed: string | null;
};

/** What a salesperson should see before typing a price: past prices to this customer, and what it cost. */
export async function priceHints(itemIds: number[], customerId: number): Promise<Map<number, PriceHint>> {
  const since = addMonths(today(), -6);
  const [toCustomer, recent, lots] = await Promise.all([
    db.invoiceLine.findMany({
      where: { itemId: { in: itemIds }, invoice: { customerId, status: "POSTED" } },
      include: { invoice: true },
      orderBy: [{ invoice: { date: "desc" } }, { id: "desc" }],
    }),
    db.invoiceLine.findMany({ where: { itemId: { in: itemIds }, invoice: { status: "POSTED", date: { gte: since } } } }),
    db.lot.findMany({
      where: { itemId: { in: itemIds }, shipmentLineId: { not: null } },
      include: { shipmentLine: { include: { shipment: true } } },
      orderBy: { receivedDate: "desc" },
    }),
  ]);
  const out = new Map<number, PriceHint>();
  for (const id of itemIds) {
    const mine = toCustomer.filter((l) => l.itemId === id);
    const seen = new Set<number>();
    const last = mine.filter((l) => !seen.has(l.invoiceId) && seen.add(l.invoiceId)).slice(0, 3);
    const all = recent.filter((l) => l.itemId === id);
    const q = all.reduce((s, l) => s.plus(l.qty.toString()), new Decimal(0));
    const v = all.reduce((s, l) => s.plus(new Decimal(l.qty.toString()).times(l.unitPrice.toString())), new Decimal(0));
    const lot = lots.find((l) => l.itemId === id);
    out.set(id, {
      lastToCustomer: last.map((l) => ({ date: l.invoice.date.toISOString(), price: l.unitPrice.toString(), number: l.invoice.number })),
      usual: q.gt(0) ? v.div(q).toDecimalPlaces(2).toString() : null,
      lastPurchase: lot?.shipmentLine
        ? { date: lot.receivedDate.toISOString(), currency: lot.shipmentLine.shipment.currency, unitPrice: lot.shipmentLine.unitPrice.toString(), ref: lot.shipmentLine.shipment.ref }
        : null,
      landed: lot ? lot.unitCostEgp.toString() : null,
    });
  }
  return out;
}

export type PricePoint = { date: Date; price: Decimal };

/** Every sale price and every batch's landed cost over the last 12 months, for the product's price chart. */
export async function priceSeries(itemId: number) {
  const from = addMonths(today(), -12);
  const [sales, lots] = await Promise.all([
    db.invoiceLine.findMany({ where: { itemId, invoice: { status: "POSTED", date: { gte: from } } }, include: { invoice: true } }),
    db.lot.findMany({ where: { itemId }, orderBy: { receivedDate: "asc" } }),
  ]);
  return {
    from,
    to: today(),
    sales: sales.map((l) => ({ date: l.invoice.date, price: new Decimal(l.unitPrice.toString()) })).sort((a, b) => a.date.getTime() - b.date.getTime()),
    costs: lots.map((l) => ({ date: l.receivedDate, price: new Decimal(l.unitCostEgp.toString()) })),
  };
}
