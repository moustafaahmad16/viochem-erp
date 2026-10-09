import Decimal from "decimal.js";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { parseInputDate } from "@/lib/dates";
import { accountLedgers, recordExpense, recordTransfer } from "@/lib/services/banking";
import { accountStatement, balanceSheet, generalLedger, incomeStatement, moneyCode, Positions, totals, trialBalance } from "@/lib/services/gl";
import { createInvoice, createShipment, postInvoice, receiveShipment } from "@/lib/services/inventory";
import { createJournal, journalAccountOptions } from "@/lib/services/journal";
import { recordCustomerPayment, recordSupplierPayment } from "@/lib/services/payments";

// 2021 dates keep these books apart from the other test files, which share the database.
const d = (s: string) => parseInputDate(s)!;
const n = (v: { toString(): string }) => Number(v.toString());
const pay = { method: "BANK_TRANSFER" as const, reference: null, notes: null };
const END = d("2021-12-31");
let egp: number, usd: number, customer: number, supplier: number;

const balanceOf = async (code: string) => {
  const t = totals(await generalLedger(), { to: END }).get(code);
  return t ? n(t.debit.minus(t.credit)) : 0;
};

beforeAll(async () => {
  egp = (await db.moneyAccount.create({ data: { name: "GL EGP bank", openingBalance: 10000, openingDate: d("2021-01-01") } })).id;
  usd = (await db.moneyAccount.create({ data: { name: "GL USD bank", currency: "USD", openingBalance: 2000, openingFxRate: 30, openingDate: d("2021-01-01") } })).id;
  customer = (await db.customer.create({ data: { name: "GL Customer", openingBalance: 500, openingBalanceDate: d("2021-01-01") } })).id;
  supplier = (await db.supplier.create({ data: { name: "GL Supplier", currency: "USD", openingBalance: 200, openingFxRate: 30, openingBalanceDate: d("2021-01-01") } })).id;
  const item = (await db.item.create({ data: { code: "GL-ITEM", name: "Iso E Super" } })).id;

  await createJournal({
    date: d("2021-01-02"),
    memo: "Capital paid in",
    createdBy: null,
    lines: [
      { account: `M${egp}`, debit: "50000", credit: "", memo: null },
      { account: `L${(await db.ledgerAccount.findUniqueOrThrow({ where: { code: "3100" } })).id}`, debit: "", credit: "50000", memo: null },
    ],
  });
  // 100 kg at USD 10, at 31: EGP 31,000 of goods plus 2,000 of clearance.
  const sh = await createShipment({ supplierId: supplier, currency: "USD", fxRate: "31", orderDate: d("2021-02-01"), etd: null, eta: null, supplierInvoiceNo: null, allocation: "VALUE", notes: null });
  await db.shipmentLine.create({ data: { shipmentId: sh.id, itemId: item, qty: 100, unitPrice: 10 } });
  await db.shipmentCharge.create({ data: { shipmentId: sh.id, kind: "Clearance", amountEgp: 2000, date: d("2021-02-08"), accountId: egp } });
  await receiveShipment(sh.id, d("2021-02-10"));
  // 40 kg at 500 plus 14% VAT; they cost 330 each.
  const inv = await createInvoice(customer, d("2021-03-01"));
  await db.invoiceLine.create({ data: { invoiceId: inv.id, itemId: item, qty: 40, unitPrice: 500 } });
  await postInvoice(inv.id);
  await recordCustomerPayment(customer, { ...pay, date: d("2021-03-02"), amount: "10000", invoiceId: null, accountId: egp });
  // Owed USD 1,200 carried at EGP 37,000; paid from dollars that cost EGP 36,000. A gain of 1,000.
  await recordSupplierPayment(supplier, { ...pay, date: d("2021-03-05"), amount: "1200", currency: "USD", fxRate: "32", shipmentId: null, accountId: usd });
  await recordExpense({ date: d("2021-03-10"), category: "Rent", description: null, payee: null, amount: "3000", vat: "0", accountId: egp, reference: null });
  await recordTransfer({ date: d("2021-03-15"), fromAccountId: egp, toAccountId: usd, amount: "3200", toAmount: "100", note: null });
});

describe("general ledger", () => {
  it("balances: every entry, and the trial balance", async () => {
    const gl = await generalLedger();
    for (const e of gl.entries) expect([e.ref, n(e.lines.reduce((s, l) => s.plus(l.debit).minus(l.credit), new Decimal(0)))]).toEqual([e.ref, 0]);
    const tb = trialBalance(gl, END);
    expect(n(tb.debit)).toBe(n(tb.credit));
  });

  it("posts each document to the right accounts", async () => {
    const [bank, dollars] = await db.moneyAccount.findMany({ where: { id: { in: [egp, usd] } }, orderBy: { id: "asc" } });
    expect(await balanceOf("1210")).toBe(500 + 22800 - 10000);
    expect(await balanceOf("1310")).toBe(33000 - 13200);
    expect(await balanceOf("1320")).toBe(0);
    expect(await balanceOf("2210")).toBe(-2800);
    expect(await balanceOf(moneyCode(bank))).toBe(10000 + 50000 - 2000 + 10000 - 3000 - 3200);
    expect(await balanceOf(moneyCode(dollars))).toBe(60000 - 36000 + 3200);
    expect(await balanceOf("6350")).toBe(-1000);
  });

  it("matches the bank account's own statement", async () => {
    const gl = await generalLedger();
    const [bank] = await accountLedgers({ id: egp });
    const account = gl.accounts.find((a) => a.moneyAccountId === egp)!;
    expect(n(accountStatement(gl, account, d("2021-01-01"), END).closing)).toBe(n(bank.balance));
  });

  it("gives an income statement and a balance sheet that adds up", async () => {
    const gl = await generalLedger();
    const p = incomeStatement(gl, d("2021-01-01"), END);
    expect([p.revenue.total, p.costOfSales.total, p.admin.total, p.finance.total, p.profitBeforeTax].map(n)).toEqual([20000, 13200, 3000, -1000, 4800]);

    const bs = balanceSheet(gl, END);
    expect(n(bs.totalAssets)).toBe(13300 + 19800 + 61800 + 27200);
    expect(n(bs.profitThisYear)).toBe(4800);
    expect(n(bs.totalAssets)).toBe(n(bs.totalLiabilities.plus(bs.totalEquity)));
  });
});

describe("foreign currency positions", () => {
  it("values what goes out at the average rate, and what goes past zero at the new rate", () => {
    const p = new Positions();
    expect(n(p.move("x", new Decimal(100), new Decimal(30)))).toBe(3000);
    expect(n(p.move("x", new Decimal(100), new Decimal(32)))).toBe(3200);
    expect(n(p.move("x", new Decimal(-50), new Decimal(40)))).toBe(-1550); // average 31
    expect(n(p.move("x", new Decimal(-200), new Decimal(40)))).toBe(-4650 - 2000); // closes 150, then 50 overdrawn at 40
    expect(n(p.rate("x")!)).toBe(40);
  });
});

describe("manual journal entries", () => {
  it("must balance and stay off accounts kept from documents", async () => {
    const id = async (code: string) => `L${(await db.ledgerAccount.findUniqueOrThrow({ where: { code } })).id}`;
    const base = { date: d("2021-06-30"), memo: "Test", createdBy: null };
    await expect(createJournal({ ...base, lines: [{ account: await id("6219"), debit: "100", credit: "", memo: null }, { account: await id("1520"), debit: "", credit: "90", memo: null }] })).rejects.toThrow(/must be equal/);
    await expect(createJournal({ ...base, lines: [{ account: await id("1210"), debit: "100", credit: "", memo: null }, { account: await id("3100"), debit: "", credit: "100", memo: null }] })).rejects.toThrow(/kept from documents/);
    await expect(createJournal({ ...base, lines: [{ account: `M${usd}`, debit: "100", credit: "", memo: null }, { account: await id("3100"), debit: "", credit: "100", memo: null }] })).rejects.toThrow(/holds USD/);
    const options = await journalAccountOptions();
    expect(options.some((o) => o.label.startsWith("1210"))).toBe(false);
    expect(options.some((o) => o.value === `M${usd}`)).toBe(false);
  });

  it("warns about a foreign opening balance with no rate", async () => {
    await db.supplier.create({ data: { name: "GL No Rate", currency: "EUR", openingBalance: 50, openingBalanceDate: d("2021-01-01") } });
    expect((await generalLedger()).warnings).toContainEqual(expect.stringMatching(/GL No Rate.*EUR/));
  });
});
