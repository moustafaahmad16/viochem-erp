import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { addDays } from "@/lib/dates";
import { CODES, EXPENSE_SECTIONS, generalLedger, incomeStatement, SECTIONS, type Ledger } from "./gl";

/** Expense accounts from the chart, which are the categories an expense can be recorded under. */
export async function expenseAccounts() {
  const accounts = await db.ledgerAccount.findMany({ where: { section: { in: EXPENSE_SECTIONS }, active: true, code: { not: CODES.fx } }, orderBy: { code: "asc" } });
  return accounts.map((a) => ({ category: a.name, group: SECTIONS[a.section].label }));
}

/**
 * Profit and loss for a period, read from the general ledger and laid out like a standard income
 * statement. Sales and their cost come from the exact lots sold, so the cost includes freight, duty
 * and clearance.
 */
export function profitAndLoss(gl: Ledger, from: Date, to: Date) {
  const s = incomeStatement(gl, from, to);
  return { ...s, netMargin: s.revenue.total.isZero() ? new Decimal(0) : s.netProfit.div(s.revenue.total).times(100) };
}

export async function loadProfitAndLoss(from: Date, to: Date) {
  return profitAndLoss(await generalLedger(), from, to);
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
