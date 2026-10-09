import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { today } from "@/lib/dates";
import { customerAccounts, supplierAccounts } from "./accounts";
import { accountLedgers } from "./banking";
import { generalLedger } from "./gl";
import { onOrder } from "./orders";
import { profitAndLoss } from "./profit";
import { marginReport, stockSummary } from "./reports";
import { latestRates, supplierRecords } from "./rfq";

/**
 * The owner's view of the business: products, customers and suppliers ranked by how much they
 * move and what they owe or are owed, and the day's money position.
 */

const dec = (v: { toString(): string } | null | undefined) => new Decimal(v == null ? 0 : v.toString());
const ZERO = new Decimal(0);
const monthsBack = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, d.getUTCDate() + 1));
const pctOf = (part: Decimal, whole: Decimal) => (whole.isZero() ? ZERO : part.div(whole).times(100));

/** Fast: the products making the first 80% of sales. Medium: the next 15%. Slow: the rest. */
export type Movement = "fast" | "medium" | "slow" | "none";

export type ProductMovementRow = {
  itemId: number;
  code: string;
  name: string;
  cas: string | null;
  unit: string;
  active: boolean;
  /** Net of returns, over the last 12 months. */
  qty: Decimal;
  revenue: Decimal;
  /** Share of all sales in the last 12 months. */
  share: Decimal;
  invoices: number;
  lastSale: Date | null;
  /** Average sold per month over the last six months. */
  monthlyRate: Decimal;
  onHand: Decimal;
  onOrder: Decimal;
  /** Months the stock on hand lasts at the monthly rate; null when nothing sold. */
  coverMonths: Decimal | null;
  movement: Movement;
  rank: number | null;
};

export async function productMovement(asOf: Date = today()): Promise<ProductMovementRow[]> {
  const from = monthsBack(asOf, 12);
  const recentFrom = monthsBack(asOf, 6);
  const [items, moves, allowances, ordered] = await Promise.all([
    db.item.findMany({ orderBy: { name: "asc" }, include: { lots: { where: { qtyOnHand: { gt: 0 } }, select: { qtyOnHand: true } } } }),
    db.stockMove.findMany({
      where: { date: { gte: from, lte: asOf }, OR: [{ kind: "SALE", invoiceLine: { invoice: { status: "POSTED" } } }, { kind: "RETURN" }] },
      select: { date: true, kind: true, qty: true, lot: { select: { itemId: true } }, invoiceLine: { select: { unitPrice: true, invoiceId: true } }, creditLine: { select: { unitPrice: true } } },
    }),
    db.creditNoteLine.findMany({
      where: { restock: false, creditNote: { status: "POSTED", date: { gte: from, lte: asOf } } },
      select: { qty: true, unitPrice: true, invoiceLine: { select: { itemId: true } } },
    }),
    onOrder(),
  ]);

  const acc = new Map<number, { qty: Decimal; recent: Decimal; revenue: Decimal; invoices: Set<number>; lastSale: Date | null }>();
  const get = (id: number) => {
    let a = acc.get(id);
    if (!a) acc.set(id, (a = { qty: ZERO, recent: ZERO, revenue: ZERO, invoices: new Set(), lastSale: null }));
    return a;
  };
  for (const m of moves) {
    const a = get(m.lot.itemId);
    // A sale takes stock out (negative), a return puts it back, so a return counts against sales.
    const q = dec(m.qty).neg();
    a.qty = a.qty.plus(q);
    if (m.date >= recentFrom) a.recent = a.recent.plus(q);
    a.revenue = a.revenue.plus(q.times(dec(m.invoiceLine?.unitPrice ?? m.creditLine?.unitPrice)));
    if (m.invoiceLine) a.invoices.add(m.invoiceLine.invoiceId);
    if (m.kind === "SALE" && (!a.lastSale || m.date > a.lastSale)) a.lastSale = m.date;
  }
  for (const l of allowances) {
    const a = get(l.invoiceLine.itemId);
    a.revenue = a.revenue.minus(dec(l.qty).times(dec(l.unitPrice)));
  }

  const totalRevenue = [...acc.values()].reduce((s, a) => s.plus(Decimal.max(a.revenue, 0)), ZERO);
  const rows: ProductMovementRow[] = items.map((i) => {
    const a = acc.get(i.id);
    const onHand = i.lots.reduce((s, l) => s.plus(dec(l.qtyOnHand)), ZERO);
    const monthlyRate = a ? Decimal.max(a.recent, 0).div(6) : ZERO;
    return {
      itemId: i.id,
      code: i.code,
      name: i.name,
      cas: i.casNumber,
      unit: i.unit,
      active: i.active,
      qty: a?.qty ?? ZERO,
      revenue: a?.revenue ?? ZERO,
      share: a ? pctOf(Decimal.max(a.revenue, 0), totalRevenue) : ZERO,
      invoices: a?.invoices.size ?? 0,
      lastSale: a?.lastSale ?? null,
      monthlyRate,
      onHand,
      onOrder: ordered.get(i.id) ?? ZERO,
      coverMonths: monthlyRate.gt(0) ? onHand.div(monthlyRate) : null,
      movement: "none",
      rank: null,
    };
  });

  // Rank by sales; nothing sold in the last six months counts as not moving, whatever came before.
  const sorted = [...rows].sort((a, b) => b.revenue.comparedTo(a.revenue) || b.qty.comparedTo(a.qty) || a.name.localeCompare(b.name));
  let cumulative = ZERO;
  let rank = 0;
  for (const r of sorted) {
    if (r.revenue.lte(0) && r.qty.lte(0)) continue;
    r.rank = ++rank;
    const before = cumulative;
    cumulative = cumulative.plus(r.share);
    if (r.monthlyRate.isZero()) continue;
    r.movement = before.lt(80) ? "fast" : before.lt(95) ? "medium" : "slow";
  }
  return rows;
}

export type SafetyRow = ProductMovementRow & {
  /** For 1, 2 and 3 months of sales: the stock needed, and how much more to order. */
  periods: { months: number; need: Decimal; short: Decimal }[];
};

export const SAFETY_MONTHS = [1, 2, 3] as const;

/** Stock to keep for one, two and three months of sales at the recent rate, against what is on hand and on order. */
export function safetyStock(rows: ProductMovementRow[]): SafetyRow[] {
  return rows
    .filter((r) => r.active && r.monthlyRate.gt(0))
    .map((r) => ({
      ...r,
      periods: SAFETY_MONTHS.map((months) => {
        const need = r.monthlyRate.times(months);
        return { months, need, short: Decimal.max(need.minus(r.onHand).minus(r.onOrder), 0) };
      }),
    }))
    .sort((a, b) => (a.coverMonths ?? ZERO).comparedTo(b.coverMonths ?? ZERO) || a.name.localeCompare(b.name));
}

export type CustomerRankRow = {
  id: number;
  name: string;
  sales: Decimal;
  margin: Decimal;
  marginPct: Decimal;
  share: Decimal;
  invoices: number;
  lastInvoice: Date | null;
  balance: Decimal;
  overdue: Decimal;
};

export const CUSTOMER_SORTS = ["sales", "margin", "balance", "overdue", "name"] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

/** Each customer's sales and margin over the last 12 months, with what they owe today. */
export async function customerRanking(sort: CustomerSort = "sales", asOf: Date = today()): Promise<CustomerRankRow[]> {
  const from = monthsBack(asOf, 12);
  const [margins, accounts, invoices] = await Promise.all([
    marginReport(from, asOf, "customer"),
    customerAccounts(),
    db.invoice.groupBy({ by: ["customerId"], where: { status: "POSTED", date: { gte: from, lte: asOf } }, _count: { _all: true } }),
  ]);
  const last = await db.invoice.groupBy({ by: ["customerId"], where: { status: "POSTED" }, _max: { date: true } });
  const byKey = new Map(margins.rows.map((r) => [r.key, r]));
  const count = new Map(invoices.map((i) => [i.customerId, i._count._all]));
  const lastDate = new Map(last.map((i) => [i.customerId, i._max.date]));
  const rows = accounts.map((a) => {
    const m = byKey.get(`c${a.customer.id}`);
    return {
      id: a.customer.id,
      name: a.customer.name,
      sales: m?.revenue ?? ZERO,
      margin: m?.margin ?? ZERO,
      marginPct: m?.marginPct ?? ZERO,
      share: m ? pctOf(m.revenue, margins.total.revenue) : ZERO,
      invoices: count.get(a.customer.id) ?? 0,
      lastInvoice: lastDate.get(a.customer.id) ?? null,
      balance: a.balance,
      overdue: a.overdue,
    };
  });
  return sortRows(rows, sort);
}

function sortRows<R extends { name: string }>(rows: R[], sort: string): R[] {
  if (sort === "name") return rows.sort((a, b) => a.name.localeCompare(b.name));
  const key = sort as keyof R;
  return rows.sort((a, b) => (b[key] as Decimal).comparedTo(a[key] as Decimal) || a.name.localeCompare(b.name));
}

export type SupplierRankRow = {
  id: number;
  name: string;
  country: string | null;
  currency: string;
  /** Goods bought in the last 12 months, in EGP at each shipment's rate. */
  purchases: Decimal;
  share: Decimal;
  shipments: number;
  lastShipment: Date | null;
  onTimePct: number | null;
  avgDaysLate: number | null;
  /** What is owed in each currency, and the EGP equivalent at the latest rate. */
  balances: { currency: string; balance: Decimal; overdue: Decimal }[];
  balance: Decimal;
  overdue: Decimal;
};

export const SUPPLIER_SORTS = ["purchases", "balance", "overdue", "name"] as const;
export type SupplierSort = (typeof SUPPLIER_SORTS)[number];

/** Each supplier's purchases over the last 12 months, delivery record and what is owed to them. */
export async function supplierRanking(sort: SupplierSort = "purchases", asOf: Date = today()): Promise<SupplierRankRow[]> {
  const from = monthsBack(asOf, 12);
  const [accounts, shipments, records, rates, last] = await Promise.all([
    supplierAccounts(),
    db.shipment.findMany({ where: { orderDate: { gte: from, lte: asOf } }, select: { supplierId: true, fxRate: true, lines: { select: { qty: true, unitPrice: true } } } }),
    supplierRecords(),
    latestRates(),
    db.shipment.groupBy({ by: ["supplierId"], _max: { orderDate: true } }),
  ]);
  const bought = new Map<number, { egp: Decimal; n: number }>();
  for (const s of shipments) {
    const b = bought.get(s.supplierId) ?? { egp: ZERO, n: 0 };
    b.egp = b.egp.plus(s.lines.reduce((sum, l) => sum.plus(dec(l.qty).times(dec(l.unitPrice))), ZERO).times(dec(s.fxRate)));
    b.n++;
    bought.set(s.supplierId, b);
  }
  const total = [...bought.values()].reduce((s, b) => s.plus(b.egp), ZERO);
  const lastDate = new Map(last.map((l) => [l.supplierId, l._max.orderDate]));
  const toEgp = (currency: string, v: Decimal) => v.times(rates.get(currency) ?? ZERO);
  const rows = accounts.map(({ supplier: s, accounts: acc }) => {
    const rec = records.bySupplier.get(s.id);
    const b = bought.get(s.id);
    const balances = acc.filter((a) => !a.balance.isZero()).map((a) => ({ currency: a.currency, balance: a.balance, overdue: a.overdue }));
    return {
      id: s.id,
      name: s.name,
      country: s.country,
      currency: s.currency,
      purchases: b?.egp ?? ZERO,
      share: b ? pctOf(b.egp, total) : ZERO,
      shipments: b?.n ?? 0,
      lastShipment: lastDate.get(s.id) ?? null,
      onTimePct: rec?.onTimePct ?? null,
      avgDaysLate: rec?.avgDaysLate ?? null,
      balances,
      balance: balances.reduce((sum, x) => sum.plus(toEgp(x.currency, x.balance)), ZERO),
      overdue: balances.reduce((sum, x) => sum.plus(toEgp(x.currency, x.overdue)), ZERO),
    };
  });
  return sortRows(rows, sort);
}

export type CashRow = { id: number; name: string; kind: string; currency: string; balance: Decimal; rate: Decimal | null; egp: Decimal | null };

/** Every bank account and cash box in use, with its balance in EGP at the latest rate. */
export async function cashPosition() {
  const [ledgers, rates] = await Promise.all([accountLedgers(), latestRates()]);
  const rows: CashRow[] = ledgers
    .filter((l) => l.account.active)
    .map(({ account: a, balance }) => {
      const rate = rates.get(a.currency) ?? (a.openingFxRate ? dec(a.openingFxRate) : null);
      return { id: a.id, name: a.name, kind: a.kind, currency: a.currency, balance, rate, egp: rate ? balance.times(rate) : null };
    });
  return { rows, total: rows.reduce((s, r) => s.plus(r.egp ?? ZERO), ZERO), missingRate: rows.filter((r) => !r.egp).map((r) => r.currency) };
}

/**
 * The daily budget: profit so far today, this month and this year, and what the business holds:
 * cash and banks, stock, what customers owe, less what is owed to suppliers.
 */
export async function dailyBudget(asOf: Date = today()) {
  const [gl, stock, cash, customers, suppliers, rates] = await Promise.all([generalLedger(), stockSummary(), cashPosition(), customerAccounts(), supplierAccounts(), latestRates()]);
  const y = asOf.getUTCFullYear();
  const periods = [
    { key: "today", label: "Today", from: asOf },
    { key: "month", label: "This month", from: new Date(Date.UTC(y, asOf.getUTCMonth(), 1)) },
    { key: "year", label: "This year", from: new Date(Date.UTC(y, 0, 1)) },
  ].map((p) => {
    const pl = profitAndLoss(gl, p.from, asOf);
    return { ...p, to: asOf, sales: pl.revenue.total, grossProfit: pl.grossProfit, netProfit: pl.netProfit, netMargin: pl.netMargin };
  });
  const stockValue = stock.reduce((s, r) => s.plus(r.value), ZERO);
  const receivable = customers.reduce((s, a) => s.plus(Decimal.max(a.balance, 0)), ZERO);
  const payable = suppliers.flatMap((s) => s.accounts).reduce((s, a) => s.plus(Decimal.max(a.balance, 0).times(rates.get(a.currency) ?? ZERO)), ZERO);
  return {
    asOf,
    periods,
    stockValue,
    cash,
    receivable,
    payable,
    net: cash.total.plus(stockValue).plus(receivable).minus(payable),
  };
}
