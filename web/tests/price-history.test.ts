import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { parseInputDate } from "@/lib/dates";
import { createInvoice, createShipment, postInvoice, receiveShipment } from "@/lib/services/inventory";
import { priceHints } from "@/lib/services/price-history";

// Dates in 2032 keep these document numbers apart from the other test files.
const d = (s: string) => parseInputDate(s)!;
let item: number, other: number, mine: number, theirs: number;

async function sell(customer: number, date: string, price: number) {
  const inv = await createInvoice(customer, d(date));
  await db.invoiceLine.create({ data: { invoiceId: inv.id, itemId: item, qty: 1, unitPrice: price } });
  await postInvoice(inv.id);
}

beforeAll(async () => {
  item = (await db.item.create({ data: { code: "PH-ITEM", name: "Price History Linalool" } })).id;
  other = (await db.item.create({ data: { code: "PH-OTHER", name: "Price History Never Bought" } })).id;
  const supplier = (await db.supplier.create({ data: { name: "Price History Supplier", currency: "EUR" } })).id;
  mine = (await db.customer.create({ data: { name: "Price History Customer" } })).id;
  theirs = (await db.customer.create({ data: { name: "Price History Other Customer" } })).id;
  const s = await createShipment({ supplierId: supplier, currency: "EUR", fxRate: "50", orderDate: d("2032-01-02"), etd: null, eta: null, supplierInvoiceNo: null, allocation: "VALUE", notes: null });
  await db.shipmentLine.create({ data: { shipmentId: s.id, itemId: item, qty: 100, unitPrice: 10 } });
  await db.shipmentCharge.create({ data: { shipmentId: s.id, kind: "Freight", amountEgp: 5000 } });
  await receiveShipment(s.id, d("2032-01-10"));
  await sell(mine, "2032-02-01", 800);
  await sell(mine, "2032-03-01", 820);
  await sell(theirs, "2032-03-15", 700);
  await sell(mine, "2032-04-01", 810);
  await sell(mine, "2032-05-01", 790);
});

describe("price history when quoting", () => {
  it("shows the last three prices to this customer, the usual price and what it cost", async () => {
    const h = (await priceHints([item, other], mine, d("2032-05-10"))).get(item)!;
    expect(h.lastToCustomer.map((s) => [s.date.slice(0, 10), Number(s.price)])).toEqual([
      ["2032-05-01", 790],
      ["2032-04-01", 810],
      ["2032-03-01", 820],
    ]);
    // Everyone's average over 6 months: (800 + 820 + 700 + 810 + 790) / 5.
    expect(Number(h.usual)).toBe(784);
    expect(h.lastPurchase).toMatchObject({ currency: "EUR" });
    expect(Number(h.lastPurchase!.unitPrice)).toBe(10);
    expect(Number(h.landed)).toBe(550); // 500 + 5,000 freight / 100
  });

  it("is empty for a product never sold or bought", async () => {
    expect((await priceHints([other], mine, d("2032-05-10"))).get(other)).toEqual({ lastToCustomer: [], usual: null, lastPurchase: null, landed: null });
  });
});
