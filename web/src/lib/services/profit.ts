import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { addDays } from "@/lib/dates";
import { marginReport } from "./reports";

/**
 * Expense categories grouped the way an Egyptian income statement presents expenses by function
 * (EAS 1): selling and distribution, general and administrative, then finance costs below
 * operating profit. A category typed in by hand counts as general and administrative.
 */
export const EXPENSE_GROUPS = [
  {
    name: "Selling and distribution",
    categories: ["Transport to customers", "Sales commissions", "Marketing", "Exhibitions and samples", "Lab tests and certificates", "Packaging", "Courier"],
  },
  {
    name: "General and administrative",
    categories: [
      "Salaries",
      "Social insurance",
      "Rent",
      "Electricity and water",
      "Phone and internet",
      "Warehouse",
      "Vehicles and fuel",
      "Travel",
      "Insurance",
      "Office supplies",
      "Software and subscriptions",
      "Professional fees",
      "Government fees",
      "Maintenance",
      "Cleaning and security",
      "Hospitality",
      "Training",
      "Donations",
      "Other",
    ],
  },
  { name: "Finance costs", categories: ["Bank charges", "Loan interest"] },
] as const;

export type ExpenseGroup = (typeof EXPENSE_GROUPS)[number]["name"];

export const EXPENSE_CATEGORIES: { category: string; group: ExpenseGroup }[] = EXPENSE_GROUPS.flatMap((g) => g.categories.map((category) => ({ category, group: g.name })));

const groupOf = new Map(EXPENSE_CATEGORIES.map((c) => [c.category.toLowerCase(), c.group]));
export const expenseGroup = (category: string): ExpenseGroup => groupOf.get(category.trim().toLowerCase()) ?? "General and administrative";

const dec = (v: { toString(): string }) => new Decimal(v.toString());

/**
 * Profit and loss for a period, before tax, laid out like a standard income statement. Sales and
 * their cost come from the exact lots sold, so the cost includes freight, duty and clearance.
 * Stock count differences are part of the cost of sales.
 */
export async function profitAndLoss(from: Date, to: Date) {
  const [margin, adjustments, expenses] = await Promise.all([
    marginReport(from, to, "item"),
    db.stockMove.findMany({ where: { kind: "ADJUSTMENT", date: { gte: from, lte: to } } }),
    db.expense.findMany({ where: { date: { gte: from, lte: to } } }),
  ]);
  const zero = new Decimal(0);
  const stockDifferences = adjustments.reduce((s, m) => s.plus(dec(m.qty).times(dec(m.unitCostEgp))), zero).toDecimalPlaces(2);
  const byCategory = new Map<string, Decimal>();
  for (const e of expenses) byCategory.set(e.category, (byCategory.get(e.category) ?? zero).plus(dec(e.amount)));
  const groups = EXPENSE_GROUPS.map((g) => {
    const lines = [...byCategory]
      .filter(([category]) => expenseGroup(category) === g.name)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount.cmp(a.amount));
    return { name: g.name as ExpenseGroup, lines, total: lines.reduce((s, l) => s.plus(l.amount), zero) };
  });
  const total = (name: ExpenseGroup) => groups.find((g) => g.name === name)!.total;
  const sales = margin.total.revenue.toDecimalPlaces(2);
  const costOfSales = margin.total.cost.toDecimalPlaces(2).minus(stockDifferences);
  const grossProfit = sales.minus(costOfSales);
  const operatingProfit = grossProfit.minus(total("Selling and distribution")).minus(total("General and administrative"));
  const netProfit = operatingProfit.minus(total("Finance costs"));
  return {
    sales,
    costOfSales,
    stockDifferences,
    grossProfit,
    groups,
    totalExpenses: groups.reduce((s, g) => s.plus(g.total), zero),
    operatingProfit,
    netProfit,
    netMargin: sales.isZero() ? zero : netProfit.div(sales).times(100),
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
