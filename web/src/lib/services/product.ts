import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { today } from "@/lib/dates";
import { onOrder } from "./orders";

const dec = (v: { toString(): string } | null | undefined) => new Decimal(v == null ? 0 : v.toString());
const ZERO = new Decimal(0);

export type MoveType = "OPENING" | "RECEIPT" | "SALE" | "ADJUSTMENT" | "RETURN";

export type HistoryRow = {
  key: string;
  date: Date;
  type: MoveType;
  /** Shipment, invoice or credit note number, with a link to it. */
  doc?: { label: string; href: string };
  party?: { name: string; href: string };
  note?: string | null;
  qtyIn: Decimal;
  qtyOut: Decimal;
  /** Landed cost for stock bought, the selling price for a sale, the price credited for a return. */
  price: Decimal;
  balance: Decimal;
  /** Weighted average cost per unit after this row. It only changes when stock is bought. */
  avgCost: Decimal;
  value: Decimal;
};

/**
 * Every movement of a product in date order, with the running balance and weighted average cost.
 * A sale on several lots shows as one row. Buying (opening stock and shipments received) is the only
 * thing that moves the average: sales, returns and stock counts go in and out at the average.
 */
export async function productHistory(itemId: number): Promise<HistoryRow[]> {
  const moves = await db.stockMove.findMany({
    where: { lot: { itemId } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    include: {
      lot: { include: { shipmentLine: { include: { shipment: { include: { supplier: true } } } } } },
      invoiceLine: { include: { invoice: { include: { customer: true } } } },
      creditLine: { include: { creditNote: { include: { customer: true } } } },
    },
  });

  // One row per document line, so a sale taken from two lots reads as one sale.
  type Group = { key: string; first: (typeof moves)[number]; qty: Decimal; cost: Decimal };
  const groups: Group[] = [];
  const byKey = new Map<string, Group>();
  for (const m of moves) {
    const key = m.invoiceLineId ? `s${m.invoiceLineId}` : m.creditLineId ? `r${m.creditLineId}` : `m${m.id}`;
    let g = byKey.get(key);
    if (!g) {
      g = { key, first: m, qty: ZERO, cost: ZERO };
      byKey.set(key, g);
      groups.push(g);
    }
    g.qty = g.qty.plus(dec(m.qty));
    g.cost = g.cost.plus(dec(m.qty).times(dec(m.unitCostEgp)));
  }

  const rows: HistoryRow[] = [];
  let balance = ZERO;
  let avg = ZERO;
  for (const g of groups) {
    const m = g.first;
    const type = m.kind as MoveType;
    if (type === "OPENING" || type === "RECEIPT") {
      const unitCost = g.qty.isZero() ? dec(m.unitCostEgp) : g.cost.div(g.qty);
      // With nothing (or less than nothing) on the shelf, the new stock sets the average on its own.
      avg = balance.lte(0) ? unitCost : balance.times(avg).plus(g.cost).div(balance.plus(g.qty));
    }
    balance = balance.plus(g.qty);

    const shipment = m.lot.shipmentLine?.shipment;
    const invoice = m.invoiceLine?.invoice;
    const credit = m.creditLine?.creditNote;
    const row: HistoryRow = {
      key: g.key,
      date: m.date,
      type,
      note: type === "ADJUSTMENT" ? m.note : undefined,
      qtyIn: g.qty.gt(0) ? g.qty : ZERO,
      qtyOut: g.qty.lt(0) ? g.qty.neg() : ZERO,
      price:
        invoice ? dec(m.invoiceLine!.unitPrice)
        : credit ? dec(m.creditLine!.unitPrice)
        : type === "ADJUSTMENT" ? avg
        : g.qty.isZero() ? dec(m.unitCostEgp) : g.cost.div(g.qty),
      balance,
      avgCost: avg,
      value: balance.times(avg),
    };
    if (type === "RECEIPT" && shipment) {
      row.doc = { label: shipment.ref, href: `/shipments/${shipment.id}` };
      row.party = { name: shipment.supplier.name, href: `/suppliers/${shipment.supplierId}` };
    } else if (invoice) {
      row.doc = { label: invoice.number, href: `/invoices/${invoice.id}` };
      row.party = { name: invoice.customer.name, href: `/customers/${invoice.customerId}` };
    } else if (credit) {
      row.doc = { label: credit.number, href: `/credit-notes/${credit.id}` };
      row.party = { name: credit.customer.name, href: `/customers/${credit.customerId}` };
    } else {
      row.doc = { label: m.lot.lotNo, href: `/stock/lots/${m.lotId}` };
    }
    rows.push(row);
  }
  return rows;
}

export type MonthRow = { month: Date; qty: Decimal; revenue: Decimal; cost: Decimal; margin: Decimal; marginPct: Decimal };
export type CustomerRow = { id: number; name: string; qty: Decimal; revenue: Decimal; margin: Decimal; marginPct: Decimal };
export type PurchaseRow = {
  lotId: number;
  date: Date;
  shipment?: { id: number; ref: string };
  supplier?: { id: number; name: string };
  qty: Decimal;
  currency: string;
  unitPrice: Decimal;
  landedCost: Decimal;
  /** Change in landed cost from the purchase before. */
  change: Decimal | null;
};

const monthStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const addMonths = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
const pctOf = (part: Decimal, whole: Decimal) => (whole.isZero() ? ZERO : part.div(whole).times(100));

/**
 * Sales, margins, buying prices and stock cover for one product, over the last 12 months to `asOf`.
 * Sales are net of returns and price allowances; cost is the real landed cost of the lots sold.
 */
export async function productAnalysis(itemId: number, asOf: Date = today()) {
  const from = addMonths(monthStart(asOf), -11);
  const [item, moves, allowances, ordered] = await Promise.all([
    db.item.findUniqueOrThrow({ where: { id: itemId }, include: { lots: { include: { shipmentLine: { include: { shipment: { include: { supplier: true } } } } } } } }),
    db.stockMove.findMany({
      where: { lot: { itemId }, date: { gte: from, lte: asOf }, kind: { in: ["SALE", "RETURN"] } },
      include: { invoiceLine: { include: { invoice: { include: { customer: true } } } }, creditLine: { include: { creditNote: { include: { customer: true } } } } },
    }),
    db.creditNoteLine.findMany({
      where: { restock: false, invoiceLine: { itemId }, creditNote: { status: "POSTED", date: { gte: from, lte: asOf } } },
      include: { creditNote: { include: { customer: true } } },
    }),
    onOrder(),
  ]);

  const months: MonthRow[] = Array.from({ length: 12 }, (_, i) => ({ month: addMonths(from, i), qty: ZERO, revenue: ZERO, cost: ZERO, margin: ZERO, marginPct: ZERO }));
  const monthOf = (d: Date) => months[(d.getUTCFullYear() - from.getUTCFullYear()) * 12 + d.getUTCMonth() - from.getUTCMonth()];
  const customers = new Map<number, CustomerRow>();
  const customerRow = (c: { id: number; name: string }) => {
    let r = customers.get(c.id);
    if (!r) customers.set(c.id, (r = { id: c.id, name: c.name, qty: ZERO, revenue: ZERO, margin: ZERO, marginPct: ZERO }));
    return r;
  };
  let lastSale: Date | null = null;

  for (const m of moves) {
    // A sale takes stock out (negative), a return puts it back, so a return counts against sales.
    const q = dec(m.qty).neg();
    const revenue = q.times(dec(m.invoiceLine?.unitPrice ?? m.creditLine?.unitPrice));
    const cost = q.times(dec(m.unitCostEgp));
    const month = monthOf(m.date);
    month.qty = month.qty.plus(q);
    month.revenue = month.revenue.plus(revenue);
    month.cost = month.cost.plus(cost);
    const c = customerRow(m.invoiceLine?.invoice.customer ?? m.creditLine!.creditNote.customer);
    c.qty = c.qty.plus(q);
    c.revenue = c.revenue.plus(revenue);
    c.margin = c.margin.plus(revenue.minus(cost));
    if (m.kind === "SALE" && (!lastSale || m.date > lastSale)) lastSale = m.date;
  }
  for (const l of allowances) {
    const amount = dec(l.qty).times(dec(l.unitPrice));
    const month = monthOf(l.creditNote.date);
    month.revenue = month.revenue.minus(amount);
    const c = customerRow(l.creditNote.customer);
    c.revenue = c.revenue.minus(amount);
    c.margin = c.margin.minus(amount);
  }
  for (const m of months) {
    m.margin = m.revenue.minus(m.cost);
    m.marginPct = pctOf(m.margin, m.revenue);
  }
  for (const c of customers.values()) c.marginPct = pctOf(c.margin, c.revenue);

  const sum = (rows: MonthRow[], k: "qty" | "revenue" | "cost") => rows.reduce((s, r) => s.plus(r[k]), ZERO);
  const qty = sum(months, "qty");
  const revenue = sum(months, "revenue");
  const cost = sum(months, "cost");
  const margin = revenue.minus(cost);
  const recent = sum(months.slice(-6), "qty").div(6);

  const onHand = item.lots.reduce((s, l) => s.plus(dec(l.qtyOnHand)), ZERO);
  const stockValue = item.lots.reduce((s, l) => s.plus(dec(l.qtyOnHand).times(dec(l.unitCostEgp))), ZERO);

  const bought = [...item.lots].sort((a, b) => a.receivedDate.getTime() - b.receivedDate.getTime() || a.id - b.id);
  const purchases: PurchaseRow[] = bought.map((l, i) => {
    const shipment = l.shipmentLine?.shipment;
    const before = i > 0 ? dec(bought[i - 1].unitCostEgp) : null;
    return {
      lotId: l.id,
      date: l.receivedDate,
      shipment: shipment && { id: shipment.id, ref: shipment.ref },
      supplier: shipment && { id: shipment.supplier.id, name: shipment.supplier.name },
      qty: dec(l.qtyReceived),
      currency: shipment?.currency ?? "EGP",
      unitPrice: l.shipmentLine ? dec(l.shipmentLine.unitPrice) : dec(l.unitCostEgp),
      landedCost: dec(l.unitCostEgp),
      change: before && !before.isZero() ? dec(l.unitCostEgp).minus(before).div(before).times(100) : null,
    };
  }).reverse();

  return {
    from,
    to: asOf,
    onHand,
    stockValue,
    onOrder: ordered.get(itemId) ?? ZERO,
    minQty: item.minQty == null ? null : dec(item.minQty),
    sales: { qty, revenue, cost, margin, marginPct: pctOf(margin, revenue), avgPrice: qty.isZero() ? ZERO : revenue.div(qty) },
    /** Average sold per month over the last six months. */
    monthlyRate: recent,
    /** How many months the stock on hand lasts at that rate; null when nothing sold. */
    coverMonths: recent.gt(0) ? onHand.div(recent) : null,
    lastSale,
    lastPurchase: purchases.find((p) => p.shipment) ?? null,
    months,
    customers: [...customers.values()].sort((a, b) => b.revenue.comparedTo(a.revenue)).slice(0, 5),
    purchases,
  };
}
