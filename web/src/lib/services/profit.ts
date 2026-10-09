import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { addDays } from "@/lib/dates";
import { marginReport } from "./reports";

export const EXPENSE_CATEGORIES = [
  "Salaries",
  "Rent",
  "Electricity and water",
  "Phone and internet",
  "Transport to customers",
  "Warehouse",
  "Bank charges",
  "Government fees",
  "Marketing",
  "Office supplies",
  "Professional fees",
  "Maintenance",
  "Other",
];

const dec = (v: { toString(): string }) => new Decimal(v.toString());

/**
 * Profit and loss for a period, before tax. Sales and their cost come from the exact lots sold,
 * so the cost includes freight, duty and clearance. Stock count differences and running
 * expenses come off after that.
 */
export async function profitAndLoss(from: Date, to: Date) {
  const [margin, adjustments, expenses] = await Promise.all([
    marginReport(from, to, "item"),
    db.stockMove.findMany({ where: { kind: "ADJUSTMENT", date: { gte: from, lte: to } } }),
    db.expense.findMany({ where: { date: { gte: from, lte: to } } }),
  ]);
  const stockDifferences = adjustments.reduce((s, m) => s.plus(dec(m.qty).times(dec(m.unitCostEgp))), new Decimal(0)).toDecimalPlaces(2);
  const byCategory = new Map<string, Decimal>();
  for (const e of expenses) byCategory.set(e.category, (byCategory.get(e.category) ?? new Decimal(0)).plus(dec(e.amount)));
  const totalExpenses = [...byCategory.values()].reduce((s, v) => s.plus(v), new Decimal(0));
  const sales = margin.total.revenue.toDecimalPlaces(2);
  const costOfSales = margin.total.cost.toDecimalPlaces(2);
  const grossProfit = sales.minus(costOfSales);
  const netProfit = grossProfit.plus(stockDifferences).minus(totalExpenses);
  return {
    sales,
    costOfSales,
    grossProfit,
    stockDifferences,
    expenses: [...byCategory].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount.cmp(a.amount)),
    totalExpenses,
    netProfit,
    netMargin: sales.isZero() ? new Decimal(0) : netProfit.div(sales).times(100),
  };
}

/** The calendar months a period touches, each clipped to the period. */
export function months(from: Date, to: Date): { from: Date; to: Date; label: string }[] {
  const out = [];
  let start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  while (start <= to && out.length < 24) {
    const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    out.push({
      from: start < from ? from : start,
      to: addDays(next, -1) > to ? to : addDays(next, -1),
      label: start.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }),
    });
    start = next;
  }
  return out;
}
