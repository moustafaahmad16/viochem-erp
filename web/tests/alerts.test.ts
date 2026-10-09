import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { parseInputDate } from "@/lib/dates";
import { lowStock } from "@/lib/services/alerts";
import { creditCheck } from "@/lib/services/credit";
import { addOpeningStock, createInvoice, postInvoice } from "@/lib/services/inventory";

// Dates in 2035 keep these document numbers apart from the other test files.
const d = (s: string) => parseInputDate(s)!;
const n = (v: { toString(): string } | null) => (v === null ? null : Number(v.toString()));

let item: number, customer: number;

beforeAll(async () => {
  item = (await db.item.create({ data: { code: "ALERT-ITEM", name: "Alert Geraniol", minQty: 50 } })).id;
  customer = (await db.customer.create({ data: { name: "Alerts Customer", paymentTermsDays: 0, creditLimit: 5000 } })).id;
  await addOpeningStock({ itemId: item, qty: 100, unitCostEgp: 10, date: d("2035-01-01"), expiryDate: null, supplierBatchNo: null });
});

describe("credit limits", () => {
  it("says how much room is left, and flags an invoice that would go over", async () => {
    let c = await creditCheck(customer, 1000);
    expect([n(c.limit), n(c.headroom), c.overLimit]).toEqual([5000, 5000, false]);

    const inv = await createInvoice(customer, d("2035-01-02"));
    await db.invoiceLine.create({ data: { invoiceId: inv.id, itemId: item, qty: 40, unitPrice: 100 } }); // 4,000 + VAT = 4,560
    await postInvoice(inv.id);

    c = await creditCheck(customer, 1000);
    expect([n(c.balance), n(c.after), c.overLimit]).toEqual([4560, 5560, true]);
    expect(c.warnings[0]).toBe("Alerts Customer would owe EGP 5,560.00, over their credit limit of EGP 5,000.00.");
    // Due on the day it was issued, so it is overdue now.
    expect(c.warnings[1]).toBe("Alerts Customer has EGP 4,560.00 overdue.");
  });

  it("has no limit when none is set", async () => {
    const other = await db.customer.create({ data: { name: "Alerts Unlimited" } });
    const c = await creditCheck(other.id, 1e9);
    expect([c.limit, c.overLimit, c.warnings]).toEqual([null, false, []]);
  });
});

describe("low stock", () => {
  it("lists products at or below their alert level", async () => {
    // 100 opening, 40 sold above: 60 left, above the 50 alert level.
    expect((await lowStock()).find((r) => r.itemId === item)).toBeUndefined();
    await db.item.update({ where: { id: item }, data: { minQty: 60 } });
    const row = (await lowStock()).find((r) => r.itemId === item)!;
    expect([n(row.onHand), n(row.minQty), n(row.coming), n(row.short)]).toEqual([60, 60, 0, 0]);
    await db.item.update({ where: { id: item }, data: { minQty: 80 } });
    expect(n((await lowStock()).find((r) => r.itemId === item)!.short)).toBe(20);
  });
});
