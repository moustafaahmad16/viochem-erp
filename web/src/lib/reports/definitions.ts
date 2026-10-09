import Decimal from "decimal.js";
import type { T } from "@/i18n/core";
import { db } from "@/lib/db";
import { parseInputDate, toInputDate, today } from "@/lib/dates";
import { AGE_BUCKETS } from "@/lib/ledger";
import { customerAccounts, supplierAccounts } from "@/lib/services/accounts";
import { lowStock } from "@/lib/services/alerts";
import { accountLedgers } from "@/lib/services/banking";
import { generalLedger } from "@/lib/services/gl";
import { productHistory } from "@/lib/services/product";
import { months, profitAndLoss } from "@/lib/services/profit";
import {
  CUSTOMER_SORTS,
  customerRanking,
  dailyBudget,
  productMovement,
  safetyStock,
  SUPPLIER_SORTS,
  supplierRanking,
  type CustomerSort,
  type Movement,
  type SupplierSort,
} from "@/lib/services/rankings";
import { expiringLots, marginReport, type MarginGroup } from "@/lib/services/reports";
import type { Report, Section, Value } from "./table";

/**
 * Every report that can be downloaded, built from the same services as the page it sits on.
 * The query string is the page's own, so the download matches what is on screen.
 */

type Build = (q: URLSearchParams, t: T) => Promise<Report>;

export const MOVEMENT_LABEL: Record<Movement, string> = { fast: "Fast moving", medium: "Medium", slow: "Slow moving", none: "Not moving" };
export const EXPIRY_WINDOWS = [30, 90, 180, 365];
export const MARGIN_GROUPS: { key: MarginGroup; label: string }[] = [
  { key: "item", label: "Product" },
  { key: "customer", label: "Customer" },
  { key: "shipment", label: "Shipment" },
  { key: "lot", label: "Lot" },
];

export function dateParam(v: unknown, fallback: Date) {
  try {
    return parseInputDate(typeof v === "string" ? v : "") ?? fallback;
  } catch {
    return fallback;
  }
}

export const customerSort = (v: unknown): CustomerSort => (CUSTOMER_SORTS.includes(v as CustomerSort) ? (v as CustomerSort) : "sales");
export const supplierSort = (v: unknown): SupplierSort => (SUPPLIER_SORTS.includes(v as SupplierSort) ? (v as SupplierSort) : "purchases");
export const monthsLabel = (t: T, n: number) => (n === 1 ? t("1 month") : t("{n} months", { n }));
export const productSort = (v: unknown) => (v === "movement" ? "movement" : "name");

const stamp = (t: T) => t("As of {date}", { date: t.date(today()) });
const neg = (v: Decimal) => v.neg();

const dashboard: Build = async (_, t) => {
  const b = await dailyBudget();
  return {
    title: t("Daily budget"),
    subtitle: stamp(t),
    file: "daily-budget",
    sections: [
      {
        title: t("Profit"),
        columns: [{ title: t("Period") }, { title: t("Sales (EGP)"), kind: "money" }, { title: t("Gross profit (EGP)"), kind: "money" }, { title: t("Net profit (EGP)"), kind: "money" }, { title: t("Net margin"), kind: "pct" }],
        rows: b.periods.map((p) => [t(p.label), p.sales, p.grossProfit, p.netProfit, p.netMargin]),
      },
      {
        title: t("Cash and banks"),
        columns: [{ title: t("Account") }, { title: t("Type") }, { title: t("Currency") }, { title: t("Balance"), kind: "money" }, { title: t("Rate"), kind: "qty" }, { title: t("Balance (EGP)"), kind: "money" }],
        rows: b.cash.rows.map((r) => [r.name, t(r.kind === "BANK" ? "Bank" : "Cash"), r.currency, r.balance, r.currency === "EGP" ? null : r.rate, r.egp]),
        total: [t("Total"), "", "", null, null, b.cash.total],
      },
      {
        title: t("What the business holds"),
        columns: [{ title: "" }, { title: "EGP", kind: "money" }],
        rows: [
          [t("Cash and banks"), b.cash.total],
          [t("Stock at landed cost"), b.stockValue],
          [t("Customers owe you"), b.receivable],
          [t("You owe suppliers"), neg(b.payable)],
        ],
        total: [t("Net position"), b.net],
        note: t("Foreign currency at the latest shipment rate."),
      },
    ],
  };
};

const products: Build = async (q, t) => {
  const search = (q.get("q") ?? "").trim().toLowerCase();
  let rows = await productMovement();
  if (search) rows = rows.filter((r) => [r.name, r.code, r.cas ?? ""].some((s) => s.toLowerCase().includes(search)));
  if (productSort(q.get("sort")) === "movement") rows.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.name.localeCompare(b.name));
  return {
    title: t("Products by movement"),
    subtitle: `${t("Last 12 months")} · ${stamp(t)}`,
    file: "products-by-movement",
    sections: [
      {
        columns: [
          { title: "#", kind: "int" }, { title: t("Product") }, { title: t("Code") }, { title: "CAS" }, { title: t("Movement") },
          { title: t("Qty sold"), kind: "qty" }, { title: t("Unit") }, { title: t("Sales (EGP)"), kind: "money0" }, { title: t("Share of sales"), kind: "pct" },
          { title: t("Invoices"), kind: "int" }, { title: t("Sold per month"), kind: "qty" }, { title: t("Last sale") }, { title: t("In stock"), kind: "qty" }, { title: t("Months of stock"), kind: "qty" },
        ],
        rows: rows.map((r) => [r.rank, r.name, r.code, r.cas, t(MOVEMENT_LABEL[r.movement]), r.qty, t(r.unit), r.revenue, r.share, r.invoices, r.monthlyRate, r.lastSale, r.onHand, r.coverMonths?.toDecimalPlaces(1) ?? null]),
      },
    ],
  };
};

const lowStockReport: Build = async (_, t) => {
  const [low, movement] = await Promise.all([lowStock(), productMovement()]);
  const safety = safetyStock(movement);
  return {
    title: t("Low stock"),
    subtitle: stamp(t),
    file: "low-stock",
    sections: [
      {
        title: t("Below the alert level"),
        columns: [{ title: t("Code") }, { title: t("Product") }, { title: t("Unit") }, { title: t("On hand"), kind: "qty" }, { title: t("Alert level"), kind: "qty" }, { title: t("Ordered or on the way"), kind: "qty" }, { title: t("Still to order"), kind: "qty" }],
        rows: low.map((r) => [r.code, r.name, t(r.unit), r.onHand, r.minQty, r.coming, r.short]),
      },
      {
        title: t("Safety stock"),
        columns: [
          { title: t("Code") }, { title: t("Product") }, { title: t("Unit") }, { title: t("Sold per month"), kind: "qty" }, { title: t("On hand"), kind: "qty" },
          { title: t("Ordered or on the way"), kind: "qty" }, { title: t("Months of stock"), kind: "qty" },
          ...[1, 2, 3].flatMap((n) => [{ title: t("Need for {period}", { period: monthsLabel(t, n) }), kind: "qty" as const }, { title: t("Order for {period}", { period: monthsLabel(t, n) }), kind: "qty" as const }]),
        ],
        rows: safety.map((r) => [r.code, r.name, t(r.unit), r.monthlyRate, r.onHand, r.onOrder, r.coverMonths?.toDecimalPlaces(1) ?? null, ...r.periods.flatMap((p) => [p.need, p.short])]),
        note: t("Sold per month is the average of the last six months."),
      },
    ],
  };
};

const customers: Build = async (q, t) => {
  const rows = await customerRanking(customerSort(q.get("sort")));
  return {
    title: t("Customers ranked"),
    subtitle: `${t("Sales over the last 12 months, balances today")} · ${stamp(t)}`,
    file: "customers-ranked",
    sections: [
      {
        columns: [
          { title: "#", kind: "int" }, { title: t("Customer") }, { title: t("Sales (EGP)"), kind: "money0" }, { title: t("Share of sales"), kind: "pct" }, { title: t("Margin (EGP)"), kind: "money0" },
          { title: t("Margin %"), kind: "pct" }, { title: t("Invoices"), kind: "int" }, { title: t("Last invoice") }, { title: t("Balance (EGP)"), kind: "money0" }, { title: t("Overdue (EGP)"), kind: "money0" },
        ],
        rows: rows.map((r, i) => [i + 1, r.name, r.sales, r.share, r.margin, r.marginPct, r.invoices, r.lastInvoice, r.balance, r.overdue]),
        total: [null, t("Total"), sum(rows, "sales"), null, sum(rows, "margin"), null, rows.reduce((s, r) => s + r.invoices, 0), null, sum(rows, "balance"), sum(rows, "overdue")],
      },
    ],
  };
};

const suppliers: Build = async (q, t) => {
  const rows = await supplierRanking(supplierSort(q.get("sort")));
  return {
    title: t("Suppliers ranked"),
    subtitle: `${t("Purchases over the last 12 months, balances today")} · ${stamp(t)}`,
    file: "suppliers-ranked",
    sections: [
      {
        columns: [
          { title: "#", kind: "int" }, { title: t("Supplier") }, { title: t("Country") }, { title: t("Purchases (EGP)"), kind: "money0" }, { title: t("Share of purchases"), kind: "pct" },
          { title: t("Shipments"), kind: "int" }, { title: t("Last shipment") }, { title: t("On time"), kind: "pct" }, { title: t("Average days late"), kind: "qty" },
          { title: t("You owe") }, { title: t("You owe (EGP)"), kind: "money0" }, { title: t("Overdue (EGP)"), kind: "money0" },
        ],
        rows: rows.map((r, i) => [
          i + 1, r.name, r.country, r.purchases, r.share, r.shipments, r.lastShipment, r.onTimePct == null ? null : new Decimal(r.onTimePct), r.avgDaysLate == null ? null : new Decimal(r.avgDaysLate).toDecimalPlaces(1),
          r.balances.map((b) => `${b.currency} ${b.balance.toFixed(2)}`).join(" · "), r.balance, r.overdue,
        ]),
        total: [null, t("Total"), null, sum(rows, "purchases"), null, rows.reduce((s, r) => s + r.shipments, 0), null, null, null, null, sum(rows, "balance"), sum(rows, "overdue")],
        note: t("Foreign currency at the latest shipment rate."),
      },
    ],
  };
};

const receivables: Build = async (_, t) => {
  const all = await customerAccounts();
  const rows = all.filter((a) => !a.balance.isZero()).sort((a, b) => b.overdue.cmp(a.overdue) || b.balance.cmp(a.balance));
  return {
    title: t("Owed to you"),
    subtitle: stamp(t),
    file: "owed-to-you",
    sections: [
      {
        columns: [{ title: t("Customer") }, { title: t("Balance (EGP)"), kind: "money" }, ...AGE_BUCKETS.map((b) => ({ title: t(b), kind: "money" as const }))],
        rows: rows.map((a) => [a.customer.name, a.balance, ...a.aging]),
        total: [t("Total"), rows.reduce((s, a) => s.plus(a.balance), new Decimal(0)), ...AGE_BUCKETS.map((_, i) => rows.reduce((s, a) => s.plus(a.aging[i]), new Decimal(0)))],
      },
    ],
  };
};

const payables: Build = async (_, t) => {
  const all = await supplierAccounts();
  const rows = all
    .flatMap((s) => s.accounts.map((a) => ({ supplier: s.supplier, ...a })))
    .filter((r) => !r.balance.isZero())
    .sort((a, b) => a.currency.localeCompare(b.currency) || b.overdue.cmp(a.overdue) || b.balance.cmp(a.balance));
  return {
    title: t("You owe"),
    subtitle: stamp(t),
    file: "you-owe",
    sections: [
      {
        columns: [{ title: t("Supplier") }, { title: t("Currency") }, { title: t("Balance"), kind: "money" }, ...AGE_BUCKETS.map((b) => ({ title: t(b), kind: "money" as const }))],
        rows: rows.map((r) => [r.supplier.name, r.currency, r.balance, ...r.aging]),
      },
    ],
  };
};

const accounts: Build = async (_, t) => {
  const ledgers = await accountLedgers();
  return {
    title: t("Bank & cash"),
    subtitle: stamp(t),
    file: "bank-and-cash",
    sections: [
      {
        columns: [{ title: t("Account") }, { title: t("Type") }, { title: t("Currency") }, { title: t("Last movement") }, { title: t("Balance"), kind: "money" }, { title: t("Status") }],
        rows: ledgers.map(({ account: a, ledger, balance }) => [a.name, t(a.kind === "BANK" ? "Bank" : "Cash"), a.currency, ledger.at(-1)?.date ?? null, balance, a.active ? "" : t("Not in use")]),
      },
    ],
  };
};

const margin: Build = async (q, t) => {
  const now = today();
  const from = dateParam(q.get("from"), new Date(Date.UTC(now.getUTCFullYear(), 0, 1)));
  const to = dateParam(q.get("to"), now);
  const group = MARGIN_GROUPS.find((g) => g.key === q.get("by")) ?? MARGIN_GROUPS[0];
  const { rows, total } = await marginReport(from, to, group.key);
  return {
    title: t("Margins"),
    subtitle: `${t.date(from)} ${t("to")} ${t.date(to)}`,
    file: `margins-${toInputDate(from)}-${toInputDate(to)}`,
    sections: [
      {
        columns: [{ title: t(group.label) }, { title: "" }, { title: t("Qty sold"), kind: "qty" }, { title: t("Sales (EGP)"), kind: "money" }, { title: t("Cost (EGP)"), kind: "money" }, { title: t("Margin (EGP)"), kind: "money" }, { title: t("Margin %"), kind: "pct" }],
        rows: rows.map((r) => [r.key === "opening" || r.key === "allowances" ? t(r.label) : r.label, r.sub ?? "", r.qty, r.revenue, r.cost, r.margin, r.marginPct]),
        total: [t("Total"), "", total.qty, total.revenue, total.cost, total.margin, total.marginPct],
      },
    ],
  };
};

type Part = "revenue" | "costOfSales" | "selling" | "admin" | "otherIncome" | "finance" | "incomeTax";

const profit: Build = async (q, t) => {
  const now = today();
  const from = dateParam(q.get("from"), new Date(Date.UTC(now.getUTCFullYear(), 0, 1)));
  const to = dateParam(q.get("to"), now);
  const gl = await generalLedger();
  const total = profitAndLoss(gl, from, to);
  const allMonths = months(from, to);
  const byMonth = allMonths.length > 1 ? allMonths.map((p) => profitAndLoss(gl, p.from, p.to)) : [];
  const first = byMonth.findIndex((p) => [p.revenue, p.costOfSales, p.selling, p.admin, p.finance, p.otherIncome].some((x) => x.lines.length));
  const cols = first < 0 ? [] : byMonth.slice(first);
  const periods = first < 0 ? [] : allMonths.slice(first);
  type PL = typeof total;
  const rows: Value[][] = [];
  const row = (label: string, get: (p: PL) => Decimal) => rows.push([label, ...cols.map(get), get(total)]);
  const section = (label: string, part: Part, cost = false) => {
    const sign = (v: Decimal) => (cost ? v.neg() : v);
    const lines = total[part].lines;
    if (lines.length > 1) {
      for (const l of lines) row(`   ${l.account.code} ${t(l.account.name)}`, (p) => sign(p[part].lines.find((x) => x.account.code === l.account.code)?.amount ?? new Decimal(0)));
    }
    row(t(label), (p) => sign(p[part].total));
  };
  section("Sales (before VAT)", "revenue");
  section("Cost of sales", "costOfSales", true);
  row(t("Gross profit"), (p) => p.grossProfit);
  section("Selling and distribution expenses", "selling", true);
  section("General and administrative expenses", "admin", true);
  if (total.otherIncome.lines.length) section("Other income", "otherIncome");
  row(t("Operating profit"), (p) => p.operatingProfit);
  section("Finance costs", "finance", true);
  row(t("Profit before tax"), (p) => p.profitBeforeTax);
  if (total.incomeTax.lines.length) {
    section("Income tax", "incomeTax", true);
    row(t("Profit after tax"), (p) => p.netProfit);
  }
  const marginRow: Value[] = [t("Net margin"), ...cols.map((c) => `${c.netMargin.toFixed(1)}%`), `${total.netMargin.toFixed(1)}%`];
  return {
    title: t("Profit and loss"),
    subtitle: `${t.date(from)} ${t("to")} ${t.date(to)} · EGP`,
    file: `profit-and-loss-${toInputDate(from)}-${toInputDate(to)}`,
    sections: [{ columns: [{ title: "" }, ...periods.map((p) => ({ title: t.date(p.from).slice(3), kind: "money" as const })), { title: t("Total"), kind: "money" }], rows: [...rows, marginRow] }],
  };
};

const expiry: Build = async (q, t) => {
  const days = EXPIRY_WINDOWS.includes(Number(q.get("days"))) ? Number(q.get("days")) : 90;
  const lots = await expiringLots(days);
  const now = today();
  return {
    title: t("Expiring lots"),
    subtitle: `${t("{n} days", { n: days })} · ${stamp(t)}`,
    file: `expiring-lots-${days}-days`,
    sections: [
      {
        columns: [{ title: t("Lot") }, { title: t("Product") }, { title: t("Expiry") }, { title: t("Days left"), kind: "int" }, { title: t("On hand"), kind: "qty" }, { title: t("Unit") }, { title: t("Value (EGP)"), kind: "money" }],
        rows: lots.map((l) => [l.lotNo, l.item.name, l.expiryDate, Math.round((l.expiryDate!.getTime() - now.getTime()) / 86_400_000), l.qtyOnHand.toString(), t(l.item.unit), new Decimal(l.qtyOnHand.toString()).times(l.unitCostEgp.toString())]),
      },
    ],
  };
};

const TYPE_LABEL: Record<string, string> = { OPENING: "Opening stock", RECEIPT: "Purchase", SALE: "Sale", ADJUSTMENT: "Stock count", RETURN: "Return" };

const productMoves: Build = async (q, t) => {
  const item = await db.item.findUnique({ where: { id: Number(q.get("id")) || 0 } });
  if (!item) throw new Error("Not found");
  const rows = await productHistory(item.id);
  return {
    title: `${item.name} · ${t("Movements")}`,
    subtitle: `${item.code}${item.casNumber ? ` · CAS ${item.casNumber}` : ""} · ${stamp(t)}`,
    file: `${item.code}-movements`,
    sections: [
      {
        columns: [
          { title: t("Date") }, { title: t("Type") }, { title: t("Document") }, { title: t("Customer or supplier") }, { title: t("In"), kind: "qty" }, { title: t("Out"), kind: "qty" },
          { title: t("Price (EGP)"), kind: "money" }, { title: t("Balance ({unit})", { unit: t(item.unit) }), kind: "qty" }, { title: t("Average cost"), kind: "money" }, { title: t("Stock value"), kind: "money" },
        ],
        rows: rows.map((r) => [r.date, t(TYPE_LABEL[r.type] ?? r.type), r.doc?.label ?? "", r.party?.name ?? r.note ?? "", r.qtyIn.isZero() ? null : r.qtyIn, r.qtyOut.isZero() ? null : r.qtyOut, r.price, r.balance, r.avgCost, r.value]),
      },
    ],
  };
};

function sum<R>(rows: R[], key: keyof R) {
  return rows.reduce((s, r) => s.plus(r[key] as Decimal), new Decimal(0));
}

export const REPORTS: Record<string, Build> = {
  dashboard,
  products,
  "low-stock": lowStockReport,
  customers,
  suppliers,
  receivables,
  payables,
  accounts,
  margin,
  profit,
  expiry,
  "product-moves": productMoves,
};

export async function buildReport(name: string, q: URLSearchParams, t: T): Promise<Report | null> {
  const build = REPORTS[name];
  return build ? build(q, t) : null;
}

export type { Section };
