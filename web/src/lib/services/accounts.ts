import Decimal from "decimal.js";
import { invoiceTotals } from "@/lib/costing";
import { dayOf, formatDate, today } from "@/lib/dates";
import { db } from "@/lib/db";
import { aging, settle, type Bill, type Credit, type SettledBill } from "@/lib/ledger";

/**
 * What customers owe VIOCHEM and what VIOCHEM owes suppliers, worked out from invoices, shipments
 * and payments every time, so the balances can never drift from the documents behind them.
 */

const dec = (v: { toString(): string }) => new Decimal(v.toString());

export type BillInfo = { label: string; href?: string };
export type StatementLine = { date: Date; label: string; href?: string; detail?: string; charge: Decimal; payment: Decimal; balance: Decimal };

export type Account = {
  currency: string;
  bills: (SettledBill & BillInfo)[];
  balance: Decimal;
  overdue: Decimal;
  aging: Decimal[];
  statement: StatementLine[];
};

const METHOD: Record<string, string> = { CASH: "Cash", BANK_TRANSFER: "Bank transfer", CHEQUE: "Cheque" };
export const methodLabel = (m: string) => METHOD[m] ?? m;

type Entry = { date: Date; order: number; label: string; href?: string; detail?: string; charge: Decimal; payment: Decimal };

function account(currency: string, bills: (Bill & BillInfo)[], credits: Credit[], entries: Entry[], asOf: Date): Account {
  const info = new Map(bills.map((b) => [b.key, b]));
  const result = settle(bills, credits);
  let running = new Decimal(0);
  const statement = [...entries]
    .sort((a, b) => a.date.getTime() - b.date.getTime() || a.order - b.order)
    .map((e) => {
      running = running.plus(e.charge).minus(e.payment);
      return { ...e, balance: running };
    });
  const buckets = aging(result.bills, asOf);
  return {
    currency,
    bills: result.bills.map((b) => ({ ...b, label: info.get(b.key)!.label, href: info.get(b.key)!.href })),
    balance: result.balance,
    overdue: buckets.slice(1).reduce((s, v) => s.plus(v), new Decimal(0)),
    aging: buckets,
    statement,
  };
}

const CHEQUE_STATUS: Record<string, string> = { PENDING: "Pending", DEPOSITED: "Deposited", CLEARED: "Cleared", BOUNCED: "Bounced" };

/** A cheque counts as paid when received or written; if it bounces, a second line bills it again. */
function chequeEntries(
  ch: { id: number; number: string; chequeNo: string; bank: string | null; date: Date; dueDate: Date; amount: { toString(): string }; status: string; bouncedOn: Date | null },
  forDoc: string | null,
): Entry[] {
  const href = `/cheques/${ch.id}`;
  const amount = dec(ch.amount);
  const zero = new Decimal(0);
  const paid: Entry = {
    date: ch.date,
    order: 1e9 + 1e6 + ch.id,
    label: ch.number,
    href,
    detail: [`Cheque ${ch.chequeNo}`, ch.bank, `Due ${formatDate(ch.dueDate)}`, CHEQUE_STATUS[ch.status], forDoc].filter(Boolean).join(" · "),
    charge: zero,
    payment: amount,
  };
  if (ch.status !== "BOUNCED" || !ch.bouncedOn) return [paid];
  return [paid, { date: ch.bouncedOn, order: 1e9 + 2e6 + ch.id, label: ch.number, href, detail: `Cheque bounced · Cheque ${ch.chequeNo}`, charge: amount, payment: zero }];
}

/** Each customer's account, in EGP. */
export async function customerAccounts(where: { id?: number } = {}) {
  const asOf = today();
  const customers = await db.customer.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      invoices: { where: { status: "POSTED" }, include: { lines: true } },
      payments: { include: { invoice: true } },
      creditNotes: { where: { status: "POSTED" }, include: { lines: true, invoice: true } },
      cheques: { include: { invoice: true } },
    },
  });
  return customers.map((c) => {
    const bills: (Bill & BillInfo)[] = [];
    const credits: Credit[] = [];
    const entries: Entry[] = [];
    const opening = dec(c.openingBalance);
    const openingDate = c.openingBalanceDate ?? dayOf(c.createdAt);
    if (opening.gt(0)) bills.push({ key: "opening", date: openingDate, dueDate: openingDate, amount: opening, label: "Opening balance" });
    if (opening.lt(0)) credits.push({ amount: opening.neg() });
    if (!opening.isZero()) entries.push({ date: openingDate, order: 0, label: "Opening balance", charge: Decimal.max(opening, 0), payment: Decimal.max(opening.neg(), 0) });

    for (const inv of c.invoices) {
      const amount = invoiceTotals(inv.lines, inv.vatRate.toString()).total;
      const key = `inv:${inv.id}`;
      bills.push({ key, date: inv.date, dueDate: inv.dueDate ?? inv.date, amount, label: inv.number, href: `/invoices/${inv.id}` });
      entries.push({ date: inv.date, order: inv.id, label: inv.number, href: `/invoices/${inv.id}`, charge: amount, payment: new Decimal(0) });
    }
    for (const p of c.payments) {
      credits.push({ amount: dec(p.amount), billKey: p.invoiceId ? `inv:${p.invoiceId}` : null });
      entries.push({
        date: p.date,
        order: 1e9 + p.id,
        label: p.number,
        detail: [methodLabel(p.method), p.reference, p.invoice && `for ${p.invoice.number}`].filter(Boolean).join(" · "),
        charge: new Decimal(0),
        payment: dec(p.amount),
      });
    }
    for (const cn of c.creditNotes) {
      const amount = invoiceTotals(cn.lines, cn.vatRate.toString()).total;
      credits.push({ amount, billKey: `inv:${cn.invoiceId}` });
      entries.push({ date: cn.date, order: 5e8 + cn.id, label: cn.number, href: `/credit-notes/${cn.id}`, detail: `Credit for ${cn.invoice.number}`, charge: new Decimal(0), payment: amount });
    }
    for (const ch of c.cheques) {
      if (ch.status !== "BOUNCED") credits.push({ amount: dec(ch.amount), billKey: ch.invoiceId ? `inv:${ch.invoiceId}` : null });
      entries.push(...chequeEntries(ch, ch.invoice && `for ${ch.invoice.number}`));
    }
    return { customer: c, payments: c.payments, ...account("EGP", bills, credits, entries, asOf) };
  });
}

/** Each supplier's accounts, one per currency they are billed in. */
export async function supplierAccounts(where: { id?: number } = {}) {
  const asOf = today();
  const suppliers = await db.supplier.findMany({
    where,
    orderBy: { name: "asc" },
    include: { shipments: { include: { lines: true } }, payments: { include: { shipment: true } }, cheques: { include: { shipment: true } } },
  });
  return suppliers.map((s) => {
    const byCurrency = new Map<string, { bills: (Bill & BillInfo)[]; credits: Credit[]; entries: Entry[] }>();
    const group = (cur: string) => {
      if (!byCurrency.has(cur)) byCurrency.set(cur, { bills: [], credits: [], entries: [] });
      return byCurrency.get(cur)!;
    };
    const opening = dec(s.openingBalance);
    const openingDate = s.openingBalanceDate ?? dayOf(s.createdAt);
    if (!opening.isZero()) {
      const g = group(s.currency);
      if (opening.gt(0)) g.bills.push({ key: "opening", date: openingDate, dueDate: openingDate, amount: opening, label: "Opening balance" });
      else g.credits.push({ amount: opening.neg() });
      g.entries.push({ date: openingDate, order: 0, label: "Opening balance", charge: Decimal.max(opening, 0), payment: Decimal.max(opening.neg(), 0) });
    }
    for (const sh of s.shipments) {
      const amount = sh.lines.reduce((sum, l) => sum.plus(dec(l.qty).times(dec(l.unitPrice))), new Decimal(0)).toDecimalPlaces(2);
      if (amount.isZero()) continue;
      const g = group(sh.currency);
      const key = `shp:${sh.id}`;
      const dueDate = sh.dueDate ?? new Date(sh.orderDate.getTime() + s.paymentTermsDays * 86_400_000);
      g.bills.push({ key, date: sh.orderDate, dueDate, amount, label: sh.ref, href: `/shipments/${sh.id}` });
      g.entries.push({
        date: sh.orderDate,
        order: sh.id,
        label: sh.ref,
        href: `/shipments/${sh.id}`,
        detail: sh.supplierInvoiceNo ? `Invoice ${sh.supplierInvoiceNo}` : undefined,
        charge: amount,
        payment: new Decimal(0),
      });
    }
    for (const p of s.payments) {
      const g = group(p.currency);
      g.credits.push({ amount: dec(p.amount), billKey: p.shipmentId ? `shp:${p.shipmentId}` : null });
      g.entries.push({
        date: p.date,
        order: 1e9 + p.id,
        label: p.number,
        detail: [methodLabel(p.method), p.reference, p.shipment && `for ${p.shipment.ref}`].filter(Boolean).join(" · "),
        charge: new Decimal(0),
        payment: dec(p.amount),
      });
    }
    for (const ch of s.cheques) {
      const g = group("EGP");
      if (ch.status !== "BOUNCED") g.credits.push({ amount: dec(ch.amount), billKey: ch.shipmentId ? `shp:${ch.shipmentId}` : null });
      g.entries.push(...chequeEntries(ch, ch.shipment && `for ${ch.shipment.ref}`));
    }
    const accounts = [...byCurrency.entries()]
      .sort(([a], [b]) => (a === s.currency ? -1 : b === s.currency ? 1 : a.localeCompare(b)))
      .map(([cur, g]) => account(cur, g.bills, g.credits, g.entries, asOf));
    return { supplier: s, payments: s.payments, accounts };
  });
}

/** Totals per currency, for the summary at the top of a list. */
export function totalsByCurrency(accounts: Account[]) {
  const totals = new Map<string, { balance: Decimal; overdue: Decimal }>();
  for (const a of accounts) {
    const t = totals.get(a.currency) ?? { balance: new Decimal(0), overdue: new Decimal(0) };
    totals.set(a.currency, { balance: t.balance.plus(a.balance), overdue: t.overdue.plus(a.overdue) });
  }
  return [...totals.entries()].map(([currency, t]) => ({ currency, ...t }));
}
