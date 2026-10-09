import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { dayOf, parseInputDate } from "@/lib/dates";
import { accountLedgers, recordExpense, recordTransfer } from "@/lib/services/banking";
import { addOpeningStock, adjustLot, createInvoice, postInvoice } from "@/lib/services/inventory";
import { recordCustomerPayment, recordSupplierPayment } from "@/lib/services/payments";
import { months, profitAndLoss } from "@/lib/services/profit";

// 2023 dates keep these document numbers apart from the other test files.
const d = (s: string) => parseInputDate(s)!;
const n = (v: { toString(): string }) => Number(v.toString());
const pay = { method: "BANK_TRANSFER" as const, reference: null, notes: null };
let bank: number, usd: number, cash: number, customer: number, supplier: number, item: number;

beforeAll(async () => {
  bank = (await db.moneyAccount.create({ data: { name: "Test CIB EGP", openingBalance: 100000, openingDate: d("2023-01-01") } })).id;
  usd = (await db.moneyAccount.create({ data: { name: "Test CIB USD", currency: "USD" } })).id;
  cash = (await db.moneyAccount.create({ data: { name: "Test cash", kind: "CASH" } })).id;
  customer = (await db.customer.create({ data: { name: "Accounting Customer" } })).id;
  supplier = (await db.supplier.create({ data: { name: "Accounting Supplier", currency: "USD" } })).id;
  item = (await db.item.create({ data: { code: "ACC-ITEM", name: "Hedione" } })).id;
});

describe("bank and cash", () => {
  it("adds up everything paid in and out", async () => {
    await recordCustomerPayment(customer, { ...pay, date: d("2023-02-01"), amount: "11400", invoiceId: null, accountId: bank });
    // Paying dollars from the EGP account takes out the EGP equivalent.
    await recordSupplierPayment(supplier, { ...pay, date: d("2023-02-02"), amount: "1000", currency: "USD", fxRate: "30.9", shipmentId: null, accountId: bank });
    await recordExpense({ date: d("2023-02-03"), category: "Rent", description: null, payee: "Landlord", amount: "5000", vat: "0", accountId: bank, reference: null });
    await recordTransfer({ date: d("2023-02-04"), fromAccountId: bank, toAccountId: cash, amount: "2000", toAmount: null, note: "Petty cash" });
    await recordTransfer({ date: d("2023-02-05"), fromAccountId: bank, toAccountId: usd, amount: "31000", toAmount: "1000", note: null });

    const [b, u, c] = await Promise.all([bank, usd, cash].map(async (id) => (await accountLedgers({ id }))[0]));
    expect(n(b.balance)).toBe(100000 + 11400 - 30900 - 5000 - 2000 - 31000);
    expect(b.ledger.map((m) => m.label)).toEqual(["Opening balance", "RCV-2023-0001", "PAY-2023-0001", "EXP-2023-0001", "Transfer out", "Transfer out"]);
    expect(n(u.balance)).toBe(1000);
    expect(n(c.balance)).toBe(2000);
  });

  it("puts an undated opening balance first", async () => {
    const box = await db.moneyAccount.create({ data: { name: "Test box", kind: "CASH", openingBalance: 500 } });
    await recordExpense({ date: dayOf(new Date()), category: "Other", description: null, payee: null, amount: "100", vat: "0", accountId: box.id, reference: null });
    const [l] = await accountLedgers({ id: box.id });
    expect(l.ledger.map((m) => [m.label, n(m.balance)])).toEqual([["Opening balance", 500], [expect.stringMatching(/^EXP-/), 400]]);
  });

  it("refuses money in the wrong currency", async () => {
    await expect(recordSupplierPayment(supplier, { ...pay, date: d("2023-02-06"), amount: "10", currency: "EUR", fxRate: "33", shipmentId: null, accountId: usd })).rejects.toThrow(/holds USD/);
    await expect(recordCustomerPayment(customer, { ...pay, date: d("2023-02-06"), amount: "10", invoiceId: null, accountId: usd })).rejects.toThrow(/EGP account/);
    await expect(recordTransfer({ date: d("2023-02-06"), fromAccountId: bank, toAccountId: usd, amount: "100", toAmount: null, note: null })).rejects.toThrow(/how much USD/);
    await expect(recordTransfer({ date: d("2023-02-06"), fromAccountId: bank, toAccountId: bank, amount: "100", toAmount: null, note: null })).rejects.toThrow(/two different/);
  });
});

describe("profit and loss", () => {
  it("takes landed cost, stock differences and expenses off sales", async () => {
    await addOpeningStock({ itemId: item, qty: 10, unitCostEgp: 100, date: d("2023-03-01"), expiryDate: null, supplierBatchNo: null });
    const inv = await createInvoice(customer, d("2023-03-10"));
    await db.invoiceLine.create({ data: { invoiceId: inv.id, itemId: item, qty: 4, unitPrice: 250 } });
    await postInvoice(inv.id);
    await recordExpense({ date: d("2023-03-15"), category: "Salaries", description: null, payee: null, amount: "300", vat: "42", accountId: null, reference: null });
    const lotId = (await db.lot.findFirstOrThrow({ where: { itemId: item } })).id;
    await adjustLot(lotId, 5, "Spillage"); // 6 on hand, counted 5: lose one at 100
    // A count is dated today; move it into the period being tested.
    await db.stockMove.updateMany({ where: { lotId, kind: "ADJUSTMENT" }, data: { date: d("2023-03-20") } });

    const p = await profitAndLoss(d("2023-03-01"), d("2023-03-31"));
    expect([p.sales, p.costOfSales, p.grossProfit, p.stockDifferences, p.totalExpenses, p.netProfit].map(n)).toEqual([1000, 400, 600, -100, 300, 200]);
    expect(p.expenses).toMatchObject([{ category: "Salaries" }]);
  });

  it("splits a period into calendar months", () => {
    expect(months(d("2023-01-15"), d("2023-03-10")).map((m) => [m.label, m.from.toISOString().slice(0, 10), m.to.toISOString().slice(0, 10)])).toEqual([
      ["Jan 2023", "2023-01-15", "2023-01-31"],
      ["Feb 2023", "2023-02-01", "2023-02-28"],
      ["Mar 2023", "2023-03-01", "2023-03-10"],
    ]);
  });
});
