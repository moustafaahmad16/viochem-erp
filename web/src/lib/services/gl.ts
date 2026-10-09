import Decimal from "decimal.js";
import type { LedgerSection, MoneyAccount } from "@prisma/client";
import { invoiceTotals } from "@/lib/costing";
import { dayOf } from "@/lib/dates";
import { db } from "@/lib/db";

/**
 * The general ledger. Every invoice, shipment, payment, expense and stock movement is turned into a
 * double-entry journal each time the books are read, so they always agree with the documents and
 * nobody has to post anything by hand. Manual journal entries add what no document records:
 * capital, loans, depreciation, paying VAT to the tax authority.
 *
 * Amounts are in EGP. Money held or owed in another currency is valued at the rate it came in at,
 * and the difference when it goes out at another rate is booked as an exchange difference.
 */

const dec = (v: { toString(): string }) => new Decimal(v.toString());
const ZERO = new Decimal(0);

/** Accounts the system posts to. Their codes are in the default chart. */
export const CODES = {
  unassigned: "1190",
  customers: "1210",
  chequesIn: "1220",
  stock: "1310",
  transit: "1320",
  vatIn: "1410",
  suppliers: "2110",
  chequesOut: "2120",
  vatOut: "2210",
  retained: "3200",
  opening: "3900",
  sales: "4100",
  returns: "4110",
  cogs: "5100",
  countDiff: "5200",
  otherExpense: "6220",
  fx: "6350",
} as const;

export const SECTIONS: Record<LedgerSection, { label: string; debitNormal: boolean; statement: "balance" | "income" }> = {
  CURRENT_ASSETS: { label: "Current assets", debitNormal: true, statement: "balance" },
  FIXED_ASSETS: { label: "Fixed assets", debitNormal: true, statement: "balance" },
  CURRENT_LIABILITIES: { label: "Current liabilities", debitNormal: false, statement: "balance" },
  LONG_TERM_LIABILITIES: { label: "Long-term liabilities", debitNormal: false, statement: "balance" },
  EQUITY: { label: "Equity", debitNormal: false, statement: "balance" },
  REVENUE: { label: "Revenue", debitNormal: false, statement: "income" },
  COST_OF_SALES: { label: "Cost of sales", debitNormal: true, statement: "income" },
  SELLING: { label: "Selling and distribution", debitNormal: true, statement: "income" },
  ADMIN: { label: "General and administrative", debitNormal: true, statement: "income" },
  FINANCE: { label: "Finance costs", debitNormal: true, statement: "income" },
  OTHER_INCOME: { label: "Other income", debitNormal: false, statement: "income" },
  INCOME_TAX: { label: "Income tax", debitNormal: true, statement: "income" },
};

export const EXPENSE_SECTIONS: LedgerSection[] = ["SELLING", "ADMIN", "FINANCE"];

export type GlAccount = {
  code: string;
  name: string;
  section: LedgerSection;
  /** Kept from documents: no manual entries. */
  system: boolean;
  active: boolean;
  ledgerAccountId?: number;
  moneyAccountId?: number;
  currency?: string;
};

export type GlLine = { code: string; debit: Decimal; credit: Decimal; memo?: string };
export type GlEntry = { date: Date; ref: string; href?: string; memo: string; manualId?: number; lines: GlLine[] };

/** The code a bank account or cash box has in the chart: 1110-xx for cash, 1120-xx for banks. */
export const moneyCode = (a: Pick<MoneyAccount, "id" | "kind">) => `${a.kind === "CASH" ? "1110" : "1120"}-${String(a.id).padStart(2, "0")}`;

/**
 * Foreign currency held or owed, valued in EGP. What adds to a balance is valued at its own rate;
 * what reduces it is valued at the average rate of the balance, so the gain or loss shows up
 * as the difference against the rate actually used.
 */
export class Positions {
  private held = new Map<string, { qty: Decimal; value: Decimal }>();

  /** Move `amount` (debit positive) and return its EGP value. */
  move(key: string, amount: Decimal, rate: Decimal): Decimal {
    const p = this.held.get(key) ?? { qty: ZERO, value: ZERO };
    let value: Decimal;
    if (p.qty.isZero() || p.qty.isNeg() === amount.isNeg()) value = amount.times(rate);
    else if (amount.abs().gte(p.qty.abs())) value = p.value.neg().plus(amount.plus(p.qty).times(rate));
    else value = p.value.times(amount).div(p.qty);
    value = value.toDecimalPlaces(2);
    this.held.set(key, { qty: p.qty.plus(amount), value: p.value.plus(value) });
    return value;
  }

  /** EGP for 1 unit at the balance's average rate, or null when nothing is held. */
  rate(key: string): Decimal | null {
    const p = this.held.get(key);
    return p && !p.qty.isZero() ? p.value.div(p.qty) : null;
  }
}

const line = (code: string, amount: Decimal, memo?: string): GlLine =>
  amount.isNeg() ? { code, debit: ZERO, credit: amount.neg(), memo } : { code, debit: amount, credit: ZERO, memo };

/** Add an exchange difference line so debits equal credits. */
function balanced(lines: GlLine[]): GlLine[] {
  const kept = lines.filter((l) => !l.debit.isZero() || !l.credit.isZero());
  const diff = kept.reduce((s, l) => s.plus(l.debit).minus(l.credit), ZERO);
  return diff.isZero() ? kept : [...kept, line(CODES.fx, diff.neg(), "Exchange difference")];
}

type Pending = { date: Date; rank: number; seq: number; build: () => GlEntry | null };

/** Build the whole ledger: the chart, every journal entry in date order, and anything that needs fixing. */
export async function generalLedger() {
  const [chart, moneyAccounts, customers, suppliers, shipments, moves, invoices, customerPayments, supplierPayments, expenses, transfers, manual] = await Promise.all([
    db.ledgerAccount.findMany({ orderBy: { code: "asc" } }),
    db.moneyAccount.findMany({ orderBy: { id: "asc" } }),
    db.customer.findMany({ where: { NOT: { openingBalance: 0 } } }),
    db.supplier.findMany({ where: { NOT: { openingBalance: 0 } } }),
    db.shipment.findMany({ include: { lines: true, charges: true, supplier: true } }),
    db.stockMove.findMany({ where: { kind: { in: ["OPENING", "RECEIPT", "ADJUSTMENT"] } }, include: { lot: { include: { item: true, shipmentLine: true } } } }),
    db.invoice.findMany({ where: { status: "POSTED" }, include: { customer: true, lines: { include: { moves: true } } } }),
    db.customerPayment.findMany({ include: { customer: true } }),
    db.supplierPayment.findMany({ include: { supplier: true } }),
    db.expense.findMany(),
    db.transfer.findMany({ include: { fromAccount: true, toAccount: true } }),
    db.journalEntry.findMany({ include: { lines: { include: { ledgerAccount: true, moneyAccount: true } } } }),
  ]);

  const accounts: GlAccount[] = [
    ...chart.map((a) => ({ code: a.code, name: a.name, section: a.section, system: a.system, active: a.active, ledgerAccountId: a.id })),
    ...moneyAccounts.map((m) => ({ code: moneyCode(m), name: m.name, section: "CURRENT_ASSETS" as const, system: false, active: m.active, moneyAccountId: m.id, currency: m.currency })),
  ].sort((a, b) => a.code.localeCompare(b.code));

  const expenseCode = new Map(chart.filter((a) => EXPENSE_SECTIONS.includes(a.section)).map((a) => [a.name.trim().toLowerCase(), a.code]));
  const warnings: string[] = [];
  const fx = new Positions();
  const money = new Map(moneyAccounts.map((m) => [m.id, m]));

  /** A line on a bank or cash account; foreign accounts are valued through their position. */
  const moneyLine = (accountId: number | null, amount: Decimal, rate: Decimal, memo?: string): GlLine => {
    const m = accountId ? money.get(accountId) : undefined;
    if (!m) return line(CODES.unassigned, amount.times(rate).toDecimalPlaces(2), memo);
    if (m.currency === "EGP") return line(moneyCode(m), amount, memo);
    return line(moneyCode(m), fx.move(`money:${m.id}`, amount, rate), memo);
  };
  /** A line on what is owed to a supplier in their currency. */
  const supplierLine = (supplierId: number, currency: string, amount: Decimal, rate: Decimal, memo?: string): GlLine =>
    line(CODES.suppliers, currency === "EGP" ? amount : fx.move(`supplier:${supplierId}:${currency}`, amount, rate), memo);

  const pending: Pending[] = [];
  const add = (date: Date, rank: number, seq: number, build: () => GlEntry | null) => pending.push({ date, rank, seq, build });

  // Opening balances, before anything else on their day.
  for (const m of moneyAccounts) {
    const amount = dec(m.openingBalance);
    if (amount.isZero()) continue;
    let rate = new Decimal(1);
    if (m.currency !== "EGP") {
      if (m.openingFxRate) rate = dec(m.openingFxRate);
      else warnings.push(`${m.name} has an opening balance in ${m.currency} with no exchange rate. Add the rate on the account so it is valued in EGP.`);
    }
    add(m.openingDate ?? dayOf(m.createdAt), 0, m.id, () => {
      const l = moneyLine(m.id, amount, rate);
      return { date: m.openingDate ?? dayOf(m.createdAt), ref: "Opening balance", href: `/accounts/${m.id}`, memo: m.name, lines: [l, line(CODES.opening, l.credit.minus(l.debit))] };
    });
  }
  for (const c of customers) {
    const date = c.openingBalanceDate ?? dayOf(c.createdAt);
    const amount = dec(c.openingBalance);
    add(date, 0, c.id, () => ({ date, ref: "Opening balance", href: `/customers/${c.id}`, memo: c.name, lines: [line(CODES.customers, amount), line(CODES.opening, amount.neg())] }));
  }
  for (const s of suppliers) {
    const date = s.openingBalanceDate ?? dayOf(s.createdAt);
    const amount = dec(s.openingBalance);
    let rate = new Decimal(1);
    if (s.currency !== "EGP") {
      if (s.openingFxRate) rate = dec(s.openingFxRate);
      else warnings.push(`${s.name}'s opening balance is in ${s.currency} with no exchange rate. Add the rate on the supplier so it is valued in EGP.`);
    }
    add(date, 0, s.id, () => {
      const l = supplierLine(s.id, s.currency, amount.neg(), rate);
      return { date, ref: "Opening balance", href: `/suppliers/${s.id}`, memo: s.name, lines: [l, line(CODES.opening, l.credit.minus(l.debit))] };
    });
  }

  // Imports: the supplier's bill when ordered, charges as they are paid, stock when received.
  for (const sh of shipments) {
    const goods = sh.lines.reduce((s, l) => s.plus(dec(l.qty).times(dec(l.unitPrice))), ZERO).toDecimalPlaces(2);
    const rate = dec(sh.fxRate);
    const goodsEgp = goods.times(rate).toDecimalPlaces(2);
    const href = `/shipments/${sh.id}`;
    if (!goods.isZero()) {
      add(sh.orderDate, 1, sh.id, () => ({
        date: sh.orderDate,
        ref: sh.ref,
        href,
        memo: `Goods from ${sh.supplier.name}${sh.currency !== "EGP" ? ` · ${sh.currency} ${goods.toFixed(2)} at ${rate.toString()}` : ""}`,
        lines: balanced([line(CODES.transit, goodsEgp), supplierLine(sh.supplierId, sh.currency, goods.neg(), rate)]),
      }));
    }
    for (const c of sh.charges) {
      const date = c.date ?? sh.orderDate;
      add(date, 2, c.id, () => ({
        date,
        ref: sh.ref,
        href,
        memo: [c.kind, c.description].filter(Boolean).join(" · "),
        lines: [line(CODES.transit, dec(c.amountEgp)), moneyLine(c.accountId, dec(c.amountEgp).neg(), new Decimal(1))],
      }));
    }
  }
  const receipts = new Map<number, typeof moves>();
  for (const m of moves) {
    if (m.kind === "RECEIPT" && m.lot.shipmentLine) receipts.set(m.lot.shipmentLine.shipmentId, [...(receipts.get(m.lot.shipmentLine.shipmentId) ?? []), m]);
  }
  for (const sh of shipments) {
    const got = receipts.get(sh.id);
    if (!got?.length) continue;
    const date = got[0].date;
    add(date, 3, sh.id, () => {
      const stock = got.reduce((s, m) => s.plus(dec(m.qty).times(dec(m.unitCostEgp))), ZERO).toDecimalPlaces(2);
      const goods = sh.lines.reduce((s, l) => s.plus(dec(l.qty).times(dec(l.unitPrice))), ZERO).times(dec(sh.fxRate)).toDecimalPlaces(2);
      const landed = sh.charges.reduce((s, c) => s.plus(dec(c.amountEgp)), goods);
      return {
        date,
        ref: sh.ref,
        href: `/shipments/${sh.id}`,
        memo: "Received into stock",
        // Unit costs are kept to 4 decimals, so a few piasters of rounding go to cost of sales.
        lines: [line(CODES.stock, stock), line(CODES.transit, landed.neg()), line(CODES.cogs, landed.minus(stock), "Rounding")].filter((l) => !l.debit.isZero() || !l.credit.isZero()),
      };
    });
  }
  for (const m of moves) {
    if (m.kind === "RECEIPT") continue;
    const value = dec(m.qty).times(dec(m.unitCostEgp)).toDecimalPlaces(2);
    const opening = m.kind === "OPENING";
    add(m.date, opening ? 0 : 6, m.id, () => ({
      date: m.date,
      ref: m.lot.lotNo,
      href: `/stock/lots/${m.lotId}`,
      memo: opening ? `Opening stock · ${m.lot.item.name}` : `Stock count · ${m.lot.item.name}${m.note ? ` · ${m.note}` : ""}`,
      lines: [line(CODES.stock, value), line(opening ? CODES.opening : CODES.countDiff, value.neg())],
    }));
  }

  // Sales, with the cost of the exact lots sold.
  for (const inv of invoices) {
    add(inv.date, 4, inv.id, () => {
      const t = invoiceTotals(inv.lines, inv.vatRate.toString());
      const cost = inv.lines.flatMap((l) => l.moves).reduce((s, m) => s.plus(dec(m.qty).neg().times(dec(m.unitCostEgp))), ZERO).toDecimalPlaces(2);
      return {
        date: inv.date,
        ref: inv.number,
        href: `/invoices/${inv.id}`,
        memo: inv.customer.name,
        lines: [line(CODES.customers, t.total), line(CODES.sales, t.net.neg()), line(CODES.vatOut, t.vat.neg()), line(CODES.cogs, cost), line(CODES.stock, cost.neg())].filter(
          (l) => !l.debit.isZero() || !l.credit.isZero(),
        ),
      };
    });
  }

  // Money in and out.
  for (const p of customerPayments) {
    add(p.date, 5, p.createdAt.getTime(), () => ({
      date: p.date,
      ref: p.number,
      href: `/customers/${p.customerId}`,
      memo: `From ${p.customer.name}`,
      lines: [moneyLine(p.accountId, dec(p.amount), new Decimal(1)), line(CODES.customers, dec(p.amount).neg())],
    }));
  }
  for (const p of supplierPayments) {
    add(p.date, 5, p.createdAt.getTime(), () => {
      const amount = dec(p.amount);
      const rate = dec(p.fxRate);
      const acc = p.accountId ? money.get(p.accountId) : undefined;
      const paid = acc && acc.currency === "EGP" && p.currency !== "EGP" ? line(moneyCode(acc), amount.times(rate).toDecimalPlaces(2).neg()) : moneyLine(p.accountId, amount.neg(), rate);
      return {
        date: p.date,
        ref: p.number,
        href: `/suppliers/${p.supplierId}`,
        memo: `To ${p.supplier.name}${p.currency !== "EGP" ? ` · ${p.currency} ${amount.toFixed(2)} at ${rate.toString()}` : ""}`,
        lines: balanced([supplierLine(p.supplierId, p.currency, amount, rate), paid]),
      };
    });
  }
  for (const e of expenses) {
    add(e.date, 5, e.createdAt.getTime(), () => ({
      date: e.date,
      ref: e.number,
      href: "/expenses",
      memo: [e.category, e.payee, e.description].filter(Boolean).join(" · "),
      lines: [
        line(expenseCode.get(e.category.trim().toLowerCase()) ?? CODES.otherExpense, dec(e.amount)),
        line(CODES.vatIn, dec(e.vat)),
        moneyLine(e.accountId, dec(e.amount).plus(dec(e.vat)).neg(), new Decimal(1)),
      ].filter((l) => !l.debit.isZero() || !l.credit.isZero()),
    }));
  }
  for (const t of transfers) {
    add(t.date, 5, t.createdAt.getTime(), () => {
      const amount = dec(t.amount);
      const toAmount = dec(t.toAmount);
      const from = t.fromAccount.currency;
      const to = t.toAccount.currency;
      // The EGP side fixes the rate. Between two foreign accounts, what arrives takes the value of what left.
      const fromRate = from === "EGP" ? new Decimal(1) : to === "EGP" ? toAmount.div(amount) : (fx.rate(`money:${t.fromAccountId}`) ?? new Decimal(1));
      const out = moneyLine(t.fromAccountId, amount.neg(), fromRate);
      const toRate = to === "EGP" ? new Decimal(1) : from === "EGP" ? amount.div(toAmount) : out.credit.div(toAmount);
      return {
        date: t.date,
        ref: "Transfer",
        href: `/accounts/${t.fromAccountId}`,
        memo: `${t.fromAccount.name} to ${t.toAccount.name}${t.note ? ` · ${t.note}` : ""}`,
        lines: balanced([out, moneyLine(t.toAccountId, toAmount, toRate)]),
      };
    });
  }

  for (const j of manual) {
    add(j.date, 7, j.id, () => ({
      date: j.date,
      ref: j.number,
      href: `/ledger/journal/${j.id}`,
      memo: j.memo,
      manualId: j.id,
      lines: j.lines.map((l) => ({
        code: l.moneyAccount ? moneyCode(l.moneyAccount) : l.ledgerAccount!.code,
        debit: dec(l.debit),
        credit: dec(l.credit),
        memo: l.memo ?? undefined,
      })),
    }));
  }

  const entries = pending
    .sort((a, b) => a.date.getTime() - b.date.getTime() || a.rank - b.rank || a.seq - b.seq)
    .map((p) => p.build())
    .filter((e): e is GlEntry => e !== null && e.lines.length > 0);

  const unlinked =
    customerPayments.filter((p) => !p.accountId).length +
    supplierPayments.filter((p) => !p.accountId).length +
    expenses.filter((e) => !e.accountId).length +
    shipments.flatMap((sh) => sh.charges).filter((c) => !c.accountId).length;
  if (unlinked) {
    warnings.push(
      `${unlinked} payment${unlinked === 1 ? " doesn't" : "s and expenses don't"} say which bank or cash account was used, so ${unlinked === 1 ? "it sits" : "they sit"} in 1190. Move the total to the right account with a journal entry, or choose the account when recording from now on.`,
    );
  }

  return { accounts, entries, warnings };
}

export type Ledger = Awaited<ReturnType<typeof generalLedger>>;

/** Debits and credits per account between two dates (both included; either may be left open). */
export function totals(gl: Ledger, { from, to }: { from?: Date; to?: Date } = {}) {
  const sums = new Map<string, { debit: Decimal; credit: Decimal }>();
  for (const e of gl.entries) {
    if ((from && e.date < from) || (to && e.date > to)) continue;
    for (const l of e.lines) {
      const s = sums.get(l.code) ?? { debit: ZERO, credit: ZERO };
      sums.set(l.code, { debit: s.debit.plus(l.debit), credit: s.credit.plus(l.credit) });
    }
  }
  return sums;
}

/** An account's balance the way it is normally read: assets and expenses as debits, the rest as credits. */
export function normal(section: LedgerSection, t: { debit: Decimal; credit: Decimal } | undefined) {
  if (!t) return ZERO;
  return SECTIONS[section].debitNormal ? t.debit.minus(t.credit) : t.credit.minus(t.debit);
}

/** Debit and credit balance of every account that has moved, as of a date. */
export function trialBalance(gl: Ledger, asOf: Date) {
  const sums = totals(gl, { to: asOf });
  const rows = gl.accounts
    .map((a) => {
      const t = sums.get(a.code);
      const net = t ? t.debit.minus(t.credit) : ZERO;
      return { account: a, debit: net.gt(0) ? net : ZERO, credit: net.lt(0) ? net.neg() : ZERO };
    })
    .filter((r) => !r.debit.isZero() || !r.credit.isZero());
  return {
    rows,
    debit: rows.reduce((s, r) => s.plus(r.debit), ZERO),
    credit: rows.reduce((s, r) => s.plus(r.credit), ZERO),
  };
}

/** Income statement lines per section for a period. */
export function incomeStatement(gl: Ledger, from: Date, to: Date) {
  const sums = totals(gl, { from, to });
  const section = (s: LedgerSection) => {
    const lines = gl.accounts
      .filter((a) => a.section === s)
      .map((a) => ({ account: a, amount: normal(s, sums.get(a.code)) }))
      .filter((l) => !l.amount.isZero());
    return { lines, total: lines.reduce((t, l) => t.plus(l.amount), ZERO) };
  };
  const revenue = section("REVENUE");
  const costOfSales = section("COST_OF_SALES");
  const selling = section("SELLING");
  const admin = section("ADMIN");
  const finance = section("FINANCE");
  const otherIncome = section("OTHER_INCOME");
  const incomeTax = section("INCOME_TAX");
  const grossProfit = revenue.total.minus(costOfSales.total);
  const operatingProfit = grossProfit.minus(selling.total).minus(admin.total).plus(otherIncome.total);
  const profitBeforeTax = operatingProfit.minus(finance.total);
  return { revenue, costOfSales, grossProfit, selling, admin, otherIncome, operatingProfit, finance, profitBeforeTax, incomeTax, netProfit: profitBeforeTax.minus(incomeTax.total) };
}

/** Assets against liabilities and equity on a date. Profits not yet closed are shown in equity. */
export function balanceSheet(gl: Ledger, asOf: Date) {
  const sums = totals(gl, { to: asOf });
  const yearStart = new Date(Date.UTC(asOf.getUTCFullYear(), 0, 1));
  const profitThisYear = incomeStatement(gl, yearStart, asOf).netProfit;
  const before = new Date(yearStart.getTime() - 86_400_000);
  const earlierProfit = incomeStatement(gl, new Date(0), before).netProfit;
  const section = (s: LedgerSection) => {
    const lines = gl.accounts
      .filter((a) => a.section === s)
      .map((a) => ({ account: a, amount: normal(s, sums.get(a.code)) }))
      .filter((l) => !l.amount.isZero());
    return { lines, total: lines.reduce((t, l) => t.plus(l.amount), ZERO) };
  };
  const currentAssets = section("CURRENT_ASSETS");
  const fixedAssets = section("FIXED_ASSETS");
  const currentLiabilities = section("CURRENT_LIABILITIES");
  const longTermLiabilities = section("LONG_TERM_LIABILITIES");
  const equity = section("EQUITY");
  const totalAssets = currentAssets.total.plus(fixedAssets.total);
  const totalEquity = equity.total.plus(earlierProfit).plus(profitThisYear);
  const totalLiabilities = currentLiabilities.total.plus(longTermLiabilities.total);
  return { currentAssets, fixedAssets, totalAssets, currentLiabilities, longTermLiabilities, totalLiabilities, equity, earlierProfit, profitThisYear, totalEquity };
}

/** One account's movements in a period, with the balance carried in and after each line. */
export function accountStatement(gl: Ledger, account: GlAccount, from: Date, to: Date) {
  const sign = (l: { debit: Decimal; credit: Decimal }) => (SECTIONS[account.section].debitNormal ? l.debit.minus(l.credit) : l.credit.minus(l.debit));
  let opening = ZERO;
  const rows: { entry: GlEntry; line: GlLine; balance: Decimal }[] = [];
  let balance = ZERO;
  for (const e of gl.entries) {
    if (e.date > to) break;
    for (const l of e.lines) {
      if (l.code !== account.code) continue;
      if (e.date < from) opening = opening.plus(sign(l));
      else {
        if (!rows.length) balance = opening;
        balance = balance.plus(sign(l));
        rows.push({ entry: e, line: l, balance });
      }
    }
  }
  return { opening, rows, closing: rows.length ? balance : opening };
}
