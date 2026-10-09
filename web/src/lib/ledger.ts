import Decimal from "decimal.js";
import { addDays } from "./dates";

/**
 * How much of each bill (an invoice, a shipment, an opening balance) is still unpaid.
 * A payment first pays the bill it names; anything left over, and payments that name no bill,
 * pay the oldest bills first. This is what a customer statement shows and what both sides agree on.
 */

export type Bill<K = string> = { key: K; date: Date; dueDate: Date; amount: Decimal };
export type Credit<K = string> = { amount: Decimal; billKey?: K | null };
export type SettledBill<K = string> = Bill<K> & { paid: Decimal; outstanding: Decimal };

export function settle<K>(bills: Bill<K>[], credits: Credit<K>[]) {
  const settled: SettledBill<K>[] = [...bills]
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.date.getTime() - b.date.getTime())
    .map((b) => ({ ...b, paid: new Decimal(0), outstanding: b.amount }));
  const pay = (bill: SettledBill<K>, amount: Decimal) => {
    const take = Decimal.min(Decimal.max(bill.outstanding, 0), amount);
    bill.paid = bill.paid.plus(take);
    bill.outstanding = bill.outstanding.minus(take);
    return amount.minus(take);
  };

  let free = new Decimal(0);
  for (const c of credits) {
    const bill = c.billKey == null ? undefined : settled.find((b) => b.key === c.billKey);
    free = free.plus(bill ? pay(bill, c.amount) : c.amount);
  }
  for (const bill of settled) {
    if (free.lte(0)) break;
    free = pay(bill, free);
  }

  const billed = bills.reduce((s, b) => s.plus(b.amount), new Decimal(0));
  const credited = credits.reduce((s, c) => s.plus(c.amount), new Decimal(0));
  // balance: what is still owed; negative means they have paid in advance.
  return { bills: settled, unapplied: free, balance: billed.minus(credited) };
}

export const AGE_BUCKETS = ["Not due yet", "1–30 days late", "31–60 days late", "61–90 days late", "Over 90 days late"] as const;

/** Outstanding amounts by how late they are on a given day. */
export function aging(bills: SettledBill<unknown>[], asOf: Date): Decimal[] {
  const buckets = AGE_BUCKETS.map(() => new Decimal(0));
  for (const b of bills) {
    if (b.outstanding.lte(0)) continue;
    const late = daysLate(b.dueDate, asOf);
    const i = late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : late <= 90 ? 3 : 4;
    buckets[i] = buckets[i].plus(b.outstanding);
  }
  return buckets;
}

export function daysLate(dueDate: Date, asOf: Date): number {
  return Math.round((asOf.getTime() - dueDate.getTime()) / 86_400_000);
}

export function dueAfter(date: Date, termsDays: number): Date {
  return addDays(date, termsDays);
}
