import Decimal from "decimal.js";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { parseInputDate } from "@/lib/dates";
import { customerAccounts, supplierAccounts } from "@/lib/services/accounts";
import { accountLedgers } from "@/lib/services/banking";
import { bounceCheque, clearCheque, deleteCheque, depositCheque, issueCheque, receiveCheque, reopenCheque } from "@/lib/services/cheques";
import { CODES, generalLedger, moneyCode, totals } from "@/lib/services/gl";
import { addOpeningStock, createInvoice, createShipment, postInvoice } from "@/lib/services/inventory";

// Dates in 2033 keep these document numbers and ledger totals apart from the other test files.
const d = (s: string) => parseInputDate(s)!;
const n = (v: { toString(): string }) => Number(v.toString());
const YEAR = { from: d("2033-01-01"), to: d("2033-12-31") };

let item: number, customer: number, supplier: number, bank: number, bankCode: string;

async function gl() {
  const sums = totals(await generalLedger(), YEAR);
  const net = (code: string) => {
    const s = sums.get(code);
    return s ? n(s.debit.minus(s.credit)) : 0;
  };
  const all = [...sums.values()].reduce((t, s) => ({ debit: t.debit.plus(s.debit), credit: t.credit.plus(s.credit) }), { debit: new Decimal(0), credit: new Decimal(0) });
  return { net, balanced: all.debit.equals(all.credit) };
}

const bankBalance = async () => n((await accountLedgers({ id: bank }))[0].balance);
const customerBalance = async () => n((await customerAccounts({ id: customer }))[0].balance);

beforeAll(async () => {
  item = (await db.item.create({ data: { code: "CHQ-ITEM", name: "Cheques Linalool" } })).id;
  customer = (await db.customer.create({ data: { name: "Cheques Customer", paymentTermsDays: 30 } })).id;
  supplier = (await db.supplier.create({ data: { name: "Cheques Supplier", currency: "EGP", paymentTermsDays: 30 } })).id;
  const acc = await db.moneyAccount.create({ data: { name: "Cheques Bank", kind: "BANK", currency: "EGP" } });
  bank = acc.id;
  bankCode = moneyCode(acc);
  await addOpeningStock({ itemId: item, qty: 100, unitCostEgp: 100, date: d("2033-01-01"), expiryDate: null, supplierBatchNo: null });
});

async function postedInvoice(date: string, qty: number, price: number) {
  const inv = await createInvoice(customer, d(date));
  await db.invoiceLine.create({ data: { invoiceId: inv.id, itemId: item, qty, unitPrice: price } });
  await postInvoice(inv.id);
  return inv;
}

const common = { bank: "CIB", notes: null };

describe("received cheques", () => {
  it("settle the customer on the day received, then clear into the bank", async () => {
    const inv = await postedInvoice("2033-02-01", 10, 100); // 1,140 with VAT
    expect(await customerBalance()).toBe(1140);

    const c = await receiveCheque({ ...common, customerId: customer, invoiceId: inv.id, chequeNo: "100001", date: d("2033-02-05"), dueDate: d("2033-04-05"), amount: "1140" });
    expect(c.number).toBe("CHQ-2033-0001");
    expect(await customerBalance()).toBe(0);
    let g = await gl();
    expect(g.net(CODES.chequesIn)).toBe(1140);

    await expect(clearCheque(c.id, d("2033-04-06"))).rejects.toThrow(/Deposit the cheque/);
    await depositCheque(c.id, bank, d("2033-04-05"));
    expect(await bankBalance()).toBe(0);
    await clearCheque(c.id, d("2033-04-07"));

    const [ledger] = await accountLedgers({ id: bank });
    expect(ledger.ledger.map((m) => [m.label, n(m.amount)])).toEqual([[c.number, 1140]]);
    g = await gl();
    expect(g.net(CODES.chequesIn)).toBe(0);
    expect(g.net(bankCode)).toBe(1140);
    expect(await customerBalance()).toBe(0);
    expect(g.balanced).toBe(true);
  });

  it("make the customer owe again when they bounce", async () => {
    const inv = await postedInvoice("2033-05-01", 5, 100); // 570
    const c = await receiveCheque({ ...common, customerId: customer, invoiceId: null, chequeNo: "100002", date: d("2033-05-02"), dueDate: d("2033-06-01"), amount: "570" });
    expect(await customerBalance()).toBe(0);
    await depositCheque(c.id, bank, d("2033-06-01"));
    await bounceCheque(c.id, d("2033-06-03"));

    const [acc] = await customerAccounts({ id: customer });
    expect(n(acc.balance)).toBe(570);
    expect(acc.bills.find((b) => b.label === inv.number)?.outstanding.toString()).toBe("570");
    const lines = acc.statement.filter((l) => l.label === c.number);
    expect(lines.map((l) => [n(l.charge), n(l.payment)])).toEqual([[0, 570], [570, 0]]);
    expect(n(acc.statement.at(-1)!.balance)).toBe(570);

    const g = await gl();
    expect(g.net(CODES.chequesIn)).toBe(0);
    expect(g.net(CODES.customers)).toBe(570);
    expect(g.balanced).toBe(true);
    expect(await bankBalance()).toBe(1140);

    // Undo the bounce, then delete it while pending.
    await reopenCheque(c.id);
    expect(await customerBalance()).toBe(0);
    await deleteCheque(c.id);
    expect(await customerBalance()).toBe(570);
  });

  it("refuse bad input", async () => {
    const base = { ...common, customerId: customer, invoiceId: null, chequeNo: "1", date: d("2033-07-01"), dueDate: d("2033-07-01"), amount: "10" };
    await expect(receiveCheque({ ...base, amount: "0" })).rejects.toThrow(/more than 0/);
    await expect(receiveCheque({ ...base, dueDate: d("2033-06-30") })).rejects.toThrow(/can't be before/);
    const draft = await createInvoice(customer, d("2033-07-01"));
    await expect(receiveCheque({ ...base, invoiceId: draft.id })).rejects.toThrow(/isn't posted/);
  });
});

describe("issued cheques", () => {
  it("settle an EGP shipment and come out of the bank when cashed", async () => {
    const sh = await createShipment({ supplierId: supplier, currency: "EGP", fxRate: "1", orderDate: d("2033-08-01"), etd: null, eta: null, supplierInvoiceNo: null, allocation: "VALUE", notes: null });
    await db.shipmentLine.create({ data: { shipmentId: sh.id, itemId: item, qty: 10, unitPrice: 50 } });
    let [acc] = await supplierAccounts({ id: supplier });
    expect(n(acc.accounts[0].balance)).toBe(500);

    await expect(issueCheque({ ...common, supplierId: supplier, shipmentId: sh.id, accountId: null, chequeNo: "900001", date: d("2033-08-02"), dueDate: d("2033-09-01"), amount: "500" })).rejects.toThrow(/drawn on/);
    const c = await issueCheque({ ...common, supplierId: supplier, shipmentId: sh.id, accountId: bank, chequeNo: "900001", date: d("2033-08-02"), dueDate: d("2033-09-01"), amount: "500" });
    [acc] = await supplierAccounts({ id: supplier });
    expect(n(acc.accounts[0].balance)).toBe(0);
    let g = await gl();
    expect(g.net(CODES.chequesOut)).toBe(-500);

    await clearCheque(c.id, d("2033-09-02"));
    expect(await bankBalance()).toBe(640);
    g = await gl();
    expect(g.net(CODES.chequesOut)).toBe(0);
    expect(g.net(bankCode)).toBe(640);
    expect(g.balanced).toBe(true);
  });

  it("owe the supplier again when returned unpaid", async () => {
    const c = await issueCheque({ ...common, supplierId: supplier, shipmentId: null, accountId: bank, chequeNo: "900002", date: d("2033-10-01"), dueDate: d("2033-10-01"), amount: "200" });
    let [acc] = await supplierAccounts({ id: supplier });
    expect(n(acc.accounts[0].balance)).toBe(-200);
    await bounceCheque(c.id, d("2033-10-05"));
    [acc] = await supplierAccounts({ id: supplier });
    expect(n(acc.accounts[0].balance)).toBe(0);
    const g = await gl();
    expect(g.net(CODES.chequesOut)).toBe(0);
    expect(g.balanced).toBe(true);
  });

  it("refuse a shipment billed in another currency", async () => {
    const usd = await db.supplier.create({ data: { name: "Cheques USD Supplier", currency: "USD" } });
    const sh = await createShipment({ supplierId: usd.id, currency: "USD", fxRate: "50", orderDate: d("2033-08-01"), etd: null, eta: null, supplierInvoiceNo: null, allocation: "VALUE", notes: null });
    await expect(
      issueCheque({ ...common, supplierId: usd.id, shipmentId: sh.id, accountId: bank, chequeNo: "900003", date: d("2033-08-02"), dueDate: d("2033-09-01"), amount: "100" }),
    ).rejects.toThrow(`${sh.ref} is billed in USD. Pay it by bank transfer instead.`);
  });
});
