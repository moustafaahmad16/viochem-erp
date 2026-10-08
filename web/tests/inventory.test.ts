import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { parseInputDate } from "@/lib/dates";
import {
  addOpeningStock,
  adjustLot,
  cancelInvoice,
  createInvoice,
  createShipment,
  postInvoice,
  receiveShipment,
  recostShipment,
} from "@/lib/services/inventory";
import { marginReport, stockSummary } from "@/lib/services/reports";

const d = (s: string) => parseInputDate(s)!;
const num = (v: { toString(): string }) => Number(v.toString());

let linalool: number, vanillin: number, supplier: number, customer: number;

beforeAll(async () => {
  linalool = (await db.item.create({ data: { code: "LIN", name: "Linalool", casNumber: "78-70-6" } })).id;
  vanillin = (await db.item.create({ data: { code: "VAN", name: "Vanillin", casNumber: "121-33-5" } })).id;
  supplier = (await db.supplier.create({ data: { name: "Aroma Supplier GmbH", currency: "EUR" } })).id;
  customer = (await db.customer.create({ data: { name: "Fragrance House" } })).id;
});

async function shipmentWithCharges() {
  const s = await createShipment({
    supplierId: supplier, currency: "EUR", fxRate: "50", orderDate: d("2026-01-05"),
    etd: d("2026-01-10"), eta: d("2026-02-01"), supplierInvoiceNo: "PI-1", allocation: "VALUE", notes: null,
  });
  await db.shipmentLine.createMany({
    data: [
      { shipmentId: s.id, itemId: linalool, qty: 100, unitPrice: 10, expiryDate: d("2028-01-01") }, // 50,000 EGP
      { shipmentId: s.id, itemId: vanillin, qty: 50, unitPrice: 60, expiryDate: d("2027-06-01") }, // 150,000 EGP
    ],
  });
  await db.shipmentCharge.create({ data: { shipmentId: s.id, kind: "Freight", amountEgp: 20000 } });
  return s;
}

describe("import to sale", () => {
  it("receives a shipment with landed cost, sells it and reports the margin", async () => {
    const s = await shipmentWithCharges();
    expect(s.ref).toBe("SHP-2026-0001");

    await expect(receiveShipment(s.id, d("2026-01-01"))).rejects.toThrow(/before the departure/);
    await receiveShipment(s.id, d("2026-02-03"));
    await expect(receiveShipment(s.id, d("2026-02-03"))).rejects.toThrow(/already/);

    const lot = await db.lot.findFirstOrThrow({ where: { itemId: linalool } });
    expect(num(lot.unitCostEgp)).toBe(550); // 500 + 5,000 freight / 100 kg
    expect(lot.lotNo).toBe("LOT-2026-0001");

    // Can't sell before the goods arrived.
    const early = await createInvoice(customer, d("2026-02-01"));
    await db.invoiceLine.create({ data: { invoiceId: early.id, itemId: linalool, qty: 10, unitPrice: 800 } });
    await expect(postInvoice(early.id)).rejects.toThrow(/Not enough Linalool/);

    const inv = await createInvoice(customer, d("2026-02-10"));
    await db.invoiceLine.create({ data: { invoiceId: inv.id, itemId: linalool, qty: 40, unitPrice: 800 } });
    await postInvoice(inv.id);
    expect(num((await db.lot.findUniqueOrThrow({ where: { id: lot.id } })).qtyOnHand)).toBe(60);

    let report = await marginReport(d("2026-02-01"), d("2026-02-28"), "shipment");
    expect(report.rows[0].label).toBe(s.ref);
    expect(num(report.total.revenue)).toBe(32000);
    expect(num(report.total.cost)).toBe(22000);
    expect(num(report.total.margin)).toBe(10000);

    // The customs bill arrives late: cost of lots and of the past sale both update.
    await db.shipmentCharge.create({ data: { shipmentId: s.id, kind: "Customs duty", amountEgp: 40000 } });
    await db.$transaction((tx) => recostShipment(tx, s.id));
    report = await marginReport(d("2026-02-01"), d("2026-02-28"), "item");
    expect(num(report.total.cost)).toBe(26000); // 40 kg at 650: 500 + 60,000 x 25% / 100 kg
    expect(report.rows[0].label).toBe("Linalool");

    await cancelInvoice(inv.id);
    expect(num((await db.lot.findUniqueOrThrow({ where: { id: lot.id } })).qtyOnHand)).toBe(100);
    report = await marginReport(d("2026-02-01"), d("2026-02-28"), "item");
    expect(report.rows).toHaveLength(0);
  });

  it("takes earliest-expiry stock first and refuses to oversell", async () => {
    await addOpeningStock({ itemId: vanillin, qty: 5, unitCostEgp: 2000, date: d("2026-01-01"), expiryDate: d("2026-12-01"), supplierBatchNo: null });

    const inv = await createInvoice(customer, d("2026-03-01"));
    await db.invoiceLine.create({ data: { invoiceId: inv.id, itemId: vanillin, qty: 8, unitPrice: 4000 } });
    await postInvoice(inv.id);

    const moves = await db.stockMove.findMany({ where: { kind: "SALE", note: inv.number }, include: { lot: true }, orderBy: { id: "asc" } });
    expect(moves.map((m) => [m.lot.expiryDate?.toISOString().slice(0, 10), num(m.qty)])).toEqual([
      ["2026-12-01", -5],
      ["2027-06-01", -3],
    ]);

    const big = await createInvoice(customer, d("2026-03-02"));
    await db.invoiceLine.create({ data: { invoiceId: big.id, itemId: vanillin, qty: 1000, unitPrice: 1 } });
    await expect(postInvoice(big.id)).rejects.toThrow(/47 kg available/);
    expect((await db.invoice.findUniqueOrThrow({ where: { id: big.id } })).status).toBe("DRAFT");
  });

  it("records stock count corrections", async () => {
    const lot = await db.lot.findFirstOrThrow({ where: { itemId: linalool } });
    await expect(adjustLot(lot.id, 98, "")).rejects.toThrow(/why/);
    await adjustLot(lot.id, 98, "Spillage");
    const row = (await stockSummary()).find((r) => r.itemId === linalool)!;
    expect(num(row.qty)).toBe(98);
  });
});
