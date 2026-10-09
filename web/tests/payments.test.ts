import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { parseInputDate } from "@/lib/dates";
import { importRows } from "@/lib/services/importer";
import { customerAccounts, supplierAccounts } from "@/lib/services/accounts";
import { addOpeningStock, cancelInvoice, createInvoice, createShipment, postInvoice } from "@/lib/services/inventory";
import { recordCustomerPayment, recordSupplierPayment } from "@/lib/services/payments";

// Dates in 2024 keep these document numbers apart from the other test files.
const d = (s: string) => parseInputDate(s)!;
const n = (v: { toString(): string }) => Number(v.toString());
const pay = { method: "BANK_TRANSFER" as const, reference: null, notes: null };

let item: number, customer: number, supplier: number;

beforeAll(async () => {
  item = (await db.item.create({ data: { code: "PAY-ITEM", name: "Citronellol" } })).id;
  customer = (await db.customer.create({ data: { name: "Payments Customer", paymentTermsDays: 30, openingBalance: 1000, openingBalanceDate: d("2024-01-01") } })).id;
  supplier = (await db.supplier.create({ data: { name: "Payments Supplier", currency: "USD", paymentTermsDays: 60 } })).id;
  await addOpeningStock({ itemId: item, qty: 100, unitCostEgp: 100, date: d("2024-01-01"), expiryDate: null, supplierBatchNo: null });
});

async function postedInvoice(date: string, qty: number, price: number) {
  const inv = await createInvoice(customer, d(date));
  await db.invoiceLine.create({ data: { invoiceId: inv.id, itemId: item, qty, unitPrice: price } });
  await postInvoice(inv.id);
  return db.invoice.findUniqueOrThrow({ where: { id: inv.id } });
}

describe("customer payments", () => {
  it("sets the due date from the customer's terms and settles oldest first", async () => {
    const inv = await postedInvoice("2024-02-01", 10, 200); // 2,000 + 14% VAT = 2,280
    expect(inv.dueDate?.toISOString().slice(0, 10)).toBe("2024-03-02");

    await recordCustomerPayment(customer, { ...pay, date: d("2024-02-10"), amount: "1500", invoiceId: null });
    let [acc] = await customerAccounts({ id: customer });
    expect(n(acc.balance)).toBe(1780);
    expect(acc.bills.map((b) => [b.label, n(b.outstanding)])).toEqual([["Opening balance", 0], [inv.number, 1780]]);
    expect(acc.statement.map((l) => n(l.balance))).toEqual([1000, 3280, 1780]);

    await recordCustomerPayment(customer, { ...pay, date: d("2024-02-11"), amount: "1780", invoiceId: inv.id });
    [acc] = await customerAccounts({ id: customer });
    expect(n(acc.balance)).toBe(0);
  });

  it("leaves a payment as credit when its invoice is cancelled", async () => {
    const inv = await postedInvoice("2024-03-01", 1, 100); // 114
    await recordCustomerPayment(customer, { ...pay, date: d("2024-03-02"), amount: "114", invoiceId: inv.id });
    await cancelInvoice(inv.id);
    const [acc] = await customerAccounts({ id: customer });
    expect(n(acc.balance)).toBe(-114);
  });

  it("refuses payments for another customer's invoice, drafts or zero amounts", async () => {
    const other = await db.customer.create({ data: { name: "Someone Else" } });
    const inv = await postedInvoice("2024-03-05", 1, 100);
    await expect(recordCustomerPayment(other.id, { ...pay, date: d("2024-03-06"), amount: "10", invoiceId: inv.id })).rejects.toThrow(/different customer/);
    const draft = await createInvoice(customer, d("2024-03-07"));
    await expect(recordCustomerPayment(customer, { ...pay, date: d("2024-03-07"), amount: "10", invoiceId: draft.id })).rejects.toThrow(/isn't posted/);
    await expect(recordCustomerPayment(customer, { ...pay, date: d("2024-03-07"), amount: "0", invoiceId: null })).rejects.toThrow(/more than 0/);
  });
});

describe("supplier payments", () => {
  it("bills shipments in their currency and settles them", async () => {
    const s = await createShipment({ supplierId: supplier, currency: "USD", fxRate: "48", orderDate: d("2024-04-01"), etd: null, eta: null, supplierInvoiceNo: "PI-9", allocation: "VALUE", notes: null });
    await db.shipmentLine.create({ data: { shipmentId: s.id, itemId: item, qty: 100, unitPrice: 12.5 } });
    const deposit = await recordSupplierPayment(supplier, { ...pay, date: d("2024-04-02"), amount: "500", currency: "usd", fxRate: "48.2", shipmentId: s.id });
    expect(deposit.number).toBe("PAY-2024-0001");

    const [acc] = await supplierAccounts({ id: supplier });
    expect(acc.accounts).toHaveLength(1);
    const usd = acc.accounts[0];
    expect(usd.currency).toBe("USD");
    expect(n(usd.balance)).toBe(750);
    expect(usd.bills[0].dueDate.toISOString().slice(0, 10)).toBe("2024-05-31");

    await expect(recordSupplierPayment(supplier, { ...pay, date: d("2024-04-03"), amount: "1", currency: "EUR", fxRate: "50", shipmentId: s.id })).rejects.toThrow(/billed in USD/);
  });
});

describe("importing opening balances", () => {
  it("sets them, and an empty cell later keeps what is saved", async () => {
    await importRows("customers", [["Name", "Payment terms (days)", "Opening balance", "Opening balance date"], ["Balance Import Co", 45, "-2,500", "2024-01-31"]]);
    await importRows("customers", [["Name", "Phone"], ["Balance Import Co", "0100"]]);
    const c = await db.customer.findFirstOrThrow({ where: { name: "Balance Import Co" } });
    expect([c.paymentTermsDays, n(c.openingBalance), c.phone]).toEqual([45, -2500, "0100"]);
  });
});
