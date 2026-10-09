import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { addDays, today } from "@/lib/dates";

const dec = (v: { toString(): string } | null | undefined) => new Decimal(v == null ? 0 : v.toString());

export type MarginGroup = "item" | "customer" | "shipment" | "lot";

export type MarginRow = { key: string; label: string; sub?: string; qty: Decimal; revenue: Decimal; cost: Decimal; margin: Decimal; marginPct: Decimal };

/**
 * Sales margin from posted invoices, using the real landed cost of the exact lots that were sold.
 * Goods returned on credit notes come off at the price credited and the cost they went back in at;
 * price allowances reduce sales only.
 */
export async function marginReport(from: Date, to: Date, groupBy: MarginGroup): Promise<{ rows: MarginRow[]; total: MarginRow }> {
  const moves = await db.stockMove.findMany({
    where: { date: { gte: from, lte: to }, OR: [{ kind: "SALE", invoiceLine: { invoice: { status: "POSTED" } } }, { kind: "RETURN" }] },
    include: {
      lot: { include: { item: true, shipmentLine: { include: { shipment: { include: { supplier: true } } } } } },
      invoiceLine: { include: { invoice: { include: { customer: true } } } },
      creditLine: { include: { creditNote: { include: { customer: true } } } },
    },
  });
  const allowances = await db.creditNoteLine.findMany({
    where: { restock: false, creditNote: { status: "POSTED", date: { gte: from, lte: to } } },
    include: { invoiceLine: { include: { item: true } }, creditNote: { include: { customer: true } } },
  });

  const groups = new Map<string, MarginRow>();
  const blank = (key: string, label: string, sub?: string): MarginRow => ({
    key, label, sub, qty: new Decimal(0), revenue: new Decimal(0), cost: new Decimal(0), margin: new Decimal(0), marginPct: new Decimal(0),
  });

  for (const m of moves) {
    const qty = dec(m.qty).neg();
    // A sale takes stock out (negative), a return puts it back, so a return counts against sales.
    const revenue = qty.times(dec(m.invoiceLine?.unitPrice ?? m.creditLine?.unitPrice));
    const cost = qty.times(dec(m.unitCostEgp));
    const shipment = m.lot.shipmentLine?.shipment;
    const customer = m.invoiceLine?.invoice.customer ?? m.creditLine!.creditNote.customer;
    const [key, label, sub] =
      groupBy === "item" ? [`i${m.lot.itemId}`, m.lot.item.name, m.lot.item.code]
      : groupBy === "customer" ? [`c${customer.id}`, customer.name]
      : groupBy === "shipment" ? (shipment ? [`s${shipment.id}`, shipment.ref, shipment.supplier.name] : ["opening", "Opening stock"])
      : [`l${m.lotId}`, m.lot.lotNo, m.lot.item.name];
    const row = groups.get(key) ?? blank(key, label, sub);
    row.qty = row.qty.plus(qty);
    row.revenue = row.revenue.plus(revenue);
    row.cost = row.cost.plus(cost);
    groups.set(key, row);
  }
  for (const l of allowances) {
    const item = l.invoiceLine.item;
    const customer = l.creditNote.customer;
    const [key, label, sub] =
      groupBy === "item" ? [`i${item.id}`, item.name, item.code]
      : groupBy === "customer" ? [`c${customer.id}`, customer.name]
      : ["allowances", "Price allowances"];
    const row = groups.get(key) ?? blank(key, label, sub);
    row.revenue = row.revenue.minus(dec(l.qty).times(dec(l.unitPrice)));
    groups.set(key, row);
  }

  const finish = (r: MarginRow) => {
    r.margin = r.revenue.minus(r.cost);
    r.marginPct = r.revenue.isZero() ? new Decimal(0) : r.margin.div(r.revenue).times(100);
    return r;
  };
  const rows = [...groups.values()].map(finish).sort((a, b) => b.revenue.comparedTo(a.revenue));
  const total = finish(rows.reduce((t, r) => ({ ...t, qty: t.qty.plus(r.qty), revenue: t.revenue.plus(r.revenue), cost: t.cost.plus(r.cost) }), blank("total", "Total")));
  return { rows, total };
}

export async function stockSummary() {
  const lots = await db.lot.findMany({ where: { qtyOnHand: { gt: 0 } }, include: { item: true } });
  const byItem = new Map<number, { itemId: number; code: string; name: string; unit: string; qty: Decimal; value: Decimal; lots: number; nextExpiry: Date | null }>();
  for (const lot of lots) {
    const row = byItem.get(lot.itemId) ?? { itemId: lot.itemId, code: lot.item.code, name: lot.item.name, unit: lot.item.unit, qty: new Decimal(0), value: new Decimal(0), lots: 0, nextExpiry: null };
    row.qty = row.qty.plus(dec(lot.qtyOnHand));
    row.value = row.value.plus(dec(lot.qtyOnHand).times(dec(lot.unitCostEgp)));
    row.lots += 1;
    if (lot.expiryDate && (!row.nextExpiry || lot.expiryDate < row.nextExpiry)) row.nextExpiry = lot.expiryDate;
    byItem.set(lot.itemId, row);
  }
  return [...byItem.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function expiringLots(days: number) {
  return db.lot.findMany({
    where: { qtyOnHand: { gt: 0 }, expiryDate: { not: null, lte: addDays(today(), days) } },
    include: { item: true },
    orderBy: { expiryDate: "asc" },
  });
}

export async function dashboardStats() {
  const now = today();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [stock, month, openShipments, expiring, recentInvoices] = await Promise.all([
    stockSummary(),
    marginReport(monthStart, now, "item"),
    db.shipment.findMany({ where: { status: { not: "RECEIVED" } }, include: { supplier: true }, orderBy: [{ eta: "asc" }, { id: "asc" }] }),
    expiringLots(90),
    db.invoice.findMany({ where: { status: "POSTED" }, include: { customer: true, lines: true }, orderBy: [{ date: "desc" }, { id: "desc" }], take: 6 }),
  ]);
  return {
    stockValue: stock.reduce((s, r) => s.plus(r.value), new Decimal(0)),
    salesThisMonth: month.total.revenue,
    marginThisMonth: month.total.margin,
    marginPctThisMonth: month.total.marginPct,
    topItems: month.rows.slice(0, 5),
    openShipments,
    expiring,
    recentInvoices,
  };
}
