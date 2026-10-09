import Decimal from "decimal.js";
import type { MoneyAccount } from "@prisma/client";
import { dayOf } from "@/lib/dates";
import { db, type Tx } from "@/lib/db";
import { UserError } from "./errors";
import { nextNumber } from "./numbering";

/**
 * Bank accounts and cash boxes. A balance is never typed in: it is the opening balance plus
 * everything recorded as paid in or out of the account, so it matches the bank statement
 * as long as every payment is recorded.
 */

const dec = (v: { toString(): string }) => new Decimal(v.toString());

// order: when it was entered, to keep movements on the same day in the order they happened.
export type Movement = { date: Date; order: number; label: string; detail?: string; href?: string; amount: Decimal };

/** The amount that leaves an account when paying `amount` of `currency` at `fxRate` EGP per unit. */
export function amountInAccount(account: Pick<MoneyAccount, "currency" | "name">, currency: string, amount: Decimal.Value, fxRate: Decimal.Value): Decimal {
  if (account.currency === currency) return new Decimal(amount);
  if (account.currency === "EGP") return new Decimal(amount).times(fxRate).toDecimalPlaces(2);
  throw new UserError(`${account.name} holds ${account.currency}, so it can't pay in ${currency}. Use a ${currency} or EGP account.`);
}

export async function activeAccount(tx: Tx, id: number | null, { egpOnly = false } = {}) {
  if (!id) return null;
  const account = await tx.moneyAccount.findUnique({ where: { id } });
  if (!account || !account.active) throw new UserError("Choose an account that is in use.");
  if (egpOnly && account.currency !== "EGP") throw new UserError(`${account.name} holds ${account.currency}. Choose an EGP account.`);
  return account;
}

/** Every movement in each account, oldest first, with the balance after each one. */
export async function accountLedgers(where: { id?: number } = {}) {
  const accounts = await db.moneyAccount.findMany({
    where,
    orderBy: [{ active: "desc" }, { kind: "asc" }, { name: "asc" }],
    include: {
      customerPayments: { include: { customer: true } },
      supplierPayments: { include: { supplier: true } },
      charges: { include: { shipment: true } },
      expenses: true,
      transfersOut: { include: { toAccount: true } },
      transfersIn: { include: { fromAccount: true } },
      journalLines: { include: { entry: true } },
    },
  });
  return accounts.map((a) => {
    const moves: Movement[] = [];
    if (!dec(a.openingBalance).isZero()) moves.push({ date: a.openingDate ?? dayOf(a.createdAt), order: 0, label: "Opening balance", amount: dec(a.openingBalance) });
    for (const p of a.customerPayments) {
      moves.push({ date: p.date, order: p.createdAt.getTime(), label: p.number, detail: `From ${p.customer.name}`, href: `/customers/${p.customerId}`, amount: dec(p.amount) });
    }
    for (const p of a.supplierPayments) {
      const out = amountInAccount(a, p.currency, dec(p.amount), dec(p.fxRate));
      const detail = `To ${p.supplier.name}${p.currency !== a.currency ? ` · ${p.currency} ${dec(p.amount).toFixed(2)} at ${p.fxRate.toString()}` : ""}`;
      moves.push({ date: p.date, order: p.createdAt.getTime(), label: p.number, detail, href: `/suppliers/${p.supplierId}`, amount: out.neg() });
    }
    for (const c of a.charges) {
      moves.push({ date: c.date ?? c.shipment.orderDate, order: c.id, label: c.kind, detail: `For ${c.shipment.ref}${c.description ? ` · ${c.description}` : ""}`, href: `/shipments/${c.shipmentId}`, amount: dec(c.amountEgp).neg() });
    }
    for (const e of a.expenses) {
      moves.push({ date: e.date, order: e.createdAt.getTime(), label: e.number, detail: [e.category, e.payee, e.description].filter(Boolean).join(" · "), href: "/expenses", amount: dec(e.amount).plus(dec(e.vat)).neg() });
    }
    for (const t of a.transfersOut) {
      moves.push({ date: t.date, order: t.createdAt.getTime(), label: "Transfer out", detail: `To ${t.toAccount.name}${t.note ? ` · ${t.note}` : ""}`, href: `/accounts/${t.toAccountId}`, amount: dec(t.amount).neg() });
    }
    for (const t of a.transfersIn) {
      moves.push({ date: t.date, order: t.createdAt.getTime(), label: "Transfer in", detail: `From ${t.fromAccount.name}${t.note ? ` · ${t.note}` : ""}`, href: `/accounts/${t.fromAccountId}`, amount: dec(t.toAmount) });
    }
    for (const l of a.journalLines) {
      moves.push({ date: l.entry.date, order: l.entry.createdAt.getTime(), label: l.entry.number, detail: [l.entry.memo, l.memo].filter(Boolean).join(" · "), href: `/ledger/journal/${l.entryId}`, amount: dec(l.debit).minus(dec(l.credit)) });
    }
    let balance = new Decimal(0);
    const ledger = moves
      .sort((x, y) => x.date.getTime() - y.date.getTime() || (x.label === "Opening balance" ? -1 : y.label === "Opening balance" ? 1 : x.order - y.order))
      .map((m) => ({ ...m, balance: (balance = balance.plus(m.amount)) }));
    return { account: a, ledger, balance };
  });
}

export async function recordExpense(e: {
  date: Date;
  category: string;
  description: string | null;
  payee: string | null;
  amount: string;
  vat: string;
  accountId: number | null;
  reference: string | null;
}) {
  if (new Decimal(e.amount).lte(0)) throw new UserError("Amount must be more than 0.");
  if (new Decimal(e.vat).lt(0)) throw new UserError("VAT can't be negative.");
  return db.$transaction(async (tx) => {
    await activeAccount(tx, e.accountId, { egpOnly: true });
    return tx.expense.create({ data: { ...e, number: await nextNumber(tx, "EXP", e.date) } });
  });
}

export async function recordTransfer(t: { date: Date; fromAccountId: number; toAccountId: number; amount: string; toAmount: string | null; note: string | null }) {
  if (t.fromAccountId === t.toAccountId) throw new UserError("Choose two different accounts.");
  if (new Decimal(t.amount).lte(0)) throw new UserError("Amount must be more than 0.");
  return db.$transaction(async (tx) => {
    const from = (await activeAccount(tx, t.fromAccountId))!;
    const to = (await activeAccount(tx, t.toAccountId))!;
    let toAmount = t.amount;
    if (from.currency !== to.currency) {
      if (!t.toAmount || new Decimal(t.toAmount).lte(0)) throw new UserError(`Say how much ${to.currency} arrived in ${to.name}.`);
      toAmount = t.toAmount;
    }
    return tx.transfer.create({ data: { ...t, toAmount } });
  });
}
