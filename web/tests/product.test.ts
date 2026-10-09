import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { parseInputDate } from "@/lib/dates";
import { addCreditLine, createCreditNote, postCreditNote } from "@/lib/services/credits";
import { addOpeningStock, createInvoice, postInvoice } from "@/lib/services/inventory";
import { productAnalysis, productHistory } from "@/lib/services/product";

// Dates in 2036 keep these document numbers apart from the other test files.
const d = (s: string) => parseInputDate(s)!;
const n = (v: { toString(): string } | null) => (v === null ? null : Number(v.toString()));

let item: number, customer: number;

async function sell(date: string, qty: number, unitPrice: number) {
  const inv = await createInvoice(customer, d(date));
  const line = await db.invoiceLine.create({ data: { invoiceId: inv.id, itemId: item, qty, unitPrice } });
  await postInvoice(inv.id);
  return { invoiceId: inv.id, lineId: line.id };
}

async function credit(sale: { invoiceId: number; lineId: number }, date: string, qty: number, unitPrice: number, restock: boolean) {
  const note = await createCreditNote(sale.invoiceId, d(date), "Test");
  await addCreditLine(note.id, { invoiceLineId: sale.lineId, qty, unitPrice, restock });
  await postCreditNote(note.id);
}

beforeAll(async () => {
  item = (await db.item.create({ data: { code: "PRD-ITEM", name: "Product Citral" } })).id;
  customer = (await db.customer.create({ data: { name: "Product Customer", paymentTermsDays: 30 } })).id;
  // Expiry dates make the sales take the first lot before the second.
  await addOpeningStock({ itemId: item, qty: 100, unitCostEgp: 10, date: d("2036-01-05"), expiryDate: d("2037-01-01"), supplierBatchNo: null });
  const first = await sell("2036-02-01", 40, 20);
  await addOpeningStock({ itemId: item, qty: 60, unitCostEgp: 15, date: d("2036-03-01"), expiryDate: d("2038-01-01"), supplierBatchNo: null });
  const second = await sell("2036-04-01", 70, 25); // 60 from the first lot, 10 from the second
  await credit(second, "2036-04-15", 10, 25, true); // goods back
  await credit(first, "2036-04-20", 5, 2, false); // price allowance only
});

describe("product movements", () => {
  it("keeps the average cost until stock is bought, and shows a sale across lots as one row", async () => {
    const rows = await productHistory(item);
    expect(rows.map((r) => [r.type, n(r.qtyIn), n(r.qtyOut), n(r.price), n(r.balance), n(r.avgCost), n(r.value)])).toEqual([
      ["OPENING", 100, 0, 10, 100, 10, 1000],
      ["SALE", 0, 40, 20, 60, 10, 600],
      ["OPENING", 60, 0, 15, 120, 12.5, 1500], // (60 × 10 + 60 × 15) ÷ 120
      ["SALE", 0, 70, 25, 50, 12.5, 625],
      ["RETURN", 10, 0, 25, 60, 12.5, 750],
    ]);
    expect(rows[1].party?.name).toBe("Product Customer");
  });
});

describe("product analysis", () => {
  it("adds up sales net of returns and allowances, at the cost of the lots sold", async () => {
    const a = await productAnalysis(item, d("2036-04-30"));
    const moves = await db.stockMove.findMany({ where: { lot: { itemId: item }, kind: { in: ["SALE", "RETURN"] } } });
    const cost = moves.reduce((s, m) => s - n(m.qty)! * n(m.unitCostEgp)!, 0);

    expect(n(a.sales.qty)).toBe(100); // 40 + 70 - 10
    expect(n(a.sales.revenue)).toBe(2290); // 800 + 1,750 - 250 returned - 10 allowed
    expect(n(a.sales.cost)).toBeCloseTo(cost);
    expect(n(a.sales.avgPrice)).toBe(22.9);
    expect([n(a.onHand), a.months.length, a.months[11].month.toISOString().slice(0, 10)]).toEqual([60, 12, "2036-04-01"]);
    expect(n(a.months[9].revenue)).toBe(800); // February
    expect(n(a.months[11].revenue)).toBe(1750 - 250 - 10); // April, with the return and the allowance
    expect(n(a.monthlyRate)).toBeCloseTo(100 / 6);
    expect(n(a.coverMonths)).toBeCloseTo(3.6);
    expect(a.customers.map((c) => [c.name, n(c.revenue)])).toEqual([["Product Customer", 2290]]);
    expect(a.purchases.map((p) => n(p.landedCost))).toEqual([15, 10]);
    expect(n(a.purchases[0].change)).toBe(50);
    expect(a.lastSale?.toISOString().slice(0, 10)).toBe("2036-04-01");
  });
});
