import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";
import { translator } from "@/i18n/core";
import { db } from "@/lib/db";
import { parseInputDate } from "@/lib/dates";
import { buildReport } from "@/lib/reports/definitions";
import { reportWorkbook } from "@/lib/reports/xlsx";
import { addOpeningStock, createInvoice, createShipment, postInvoice } from "@/lib/services/inventory";
import { cashPosition, customerRanking, productMovement, safetyStock, supplierRanking } from "@/lib/services/rankings";

// Dates in 2039 keep these document numbers and sales apart from the other test files.
const d = (s: string) => parseInputDate(s)!;
const n = (v: { toString(): string } | null) => (v === null ? null : Number(v.toString()));
const asOf = d("2039-12-31");

let fast: number, slow: number, idle: number, big: number, small: number, supplier: number;

async function sell(customerId: number, itemId: number, date: string, qty: number, unitPrice: number) {
  const inv = await createInvoice(customerId, d(date));
  await db.invoiceLine.create({ data: { invoiceId: inv.id, itemId, qty, unitPrice } });
  await postInvoice(inv.id);
}

beforeAll(async () => {
  fast = (await db.item.create({ data: { code: "RPT-FAST", name: "Report Fast" } })).id;
  slow = (await db.item.create({ data: { code: "RPT-SLOW", name: "Report Slow" } })).id;
  idle = (await db.item.create({ data: { code: "RPT-IDLE", name: "Report Idle", casNumber: "64-17-5" } })).id;
  big = (await db.customer.create({ data: { name: "Report Big Customer", paymentTermsDays: 0 } })).id;
  small = (await db.customer.create({ data: { name: "Report Small Customer", paymentTermsDays: 365 } })).id;
  for (const item of [fast, slow, idle]) {
    await addOpeningStock({ itemId: item, qty: 1000, unitCostEgp: 10, date: d("2039-01-02"), expiryDate: null, supplierBatchNo: null });
  }
  // Six months of the fast one to the big customer, one sale of the slow one to the small customer.
  for (const m of ["07", "08", "09", "10", "11", "12"]) await sell(big, fast, `2039-${m}-05`, 100, 20);
  await sell(small, slow, "2039-11-10", 30, 20);

  supplier = (await db.supplier.create({ data: { name: "Report Supplier", currency: "SEK", country: "Sweden" } })).id;
  const sh = await createShipment({ supplierId: supplier, currency: "SEK", fxRate: "5", orderDate: d("2039-06-01"), etd: null, eta: null, supplierInvoiceNo: null, allocation: "VALUE", notes: null });
  await db.shipmentLine.create({ data: { shipmentId: sh.id, itemId: fast, qty: 10, unitPrice: 100 } });
});

describe("products by movement", () => {
  it("ranks by sales and sorts products into fast, slow and not moving", async () => {
    const rows = await productMovement(asOf);
    const of = (id: number) => rows.find((r) => r.itemId === id)!;
    expect([of(fast).rank, of(fast).movement, n(of(fast).qty), n(of(fast).revenue), of(fast).invoices]).toEqual([1, "fast", 600, 12000, 6]);
    expect(n(of(fast).share)).toBeCloseTo((12000 / 12600) * 100);
    expect([of(slow).rank, of(slow).movement, n(of(slow).qty)]).toEqual([2, "slow", 30]);
    expect([of(idle).rank, of(idle).movement, n(of(idle).qty)]).toEqual([null, "none", 0]);
    expect(n(of(fast).monthlyRate)).toBe(100);
    expect(n(of(fast).coverMonths)).toBe(4); // 400 left at 100 a month
    expect(n(of(fast).onOrder)).toBe(10); // the shipment on the way
    expect(of(slow).lastSale?.toISOString().slice(0, 10)).toBe("2039-11-10");
  });

  it("works out stock to keep for one, two and three months", async () => {
    // Pretend the fast product is nearly gone, to see what is short.
    const rows = (await productMovement(asOf)).map((r) => (r.itemId === fast ? { ...r, onHand: r.onHand.minus(250) } : r));
    const s = safetyStock(rows).find((r) => r.itemId === fast)!;
    expect(s.periods.map((p) => [p.months, n(p.need), n(p.short)])).toEqual([
      [1, 100, 0],
      [2, 200, 40], // 200 needed, 150 on hand, 10 on the way
      [3, 300, 140],
    ]);
    expect(safetyStock(rows).some((r) => r.itemId === idle)).toBe(false);
  });
});

describe("customers and suppliers ranked", () => {
  it("ranks customers by sales, or by what they owe", async () => {
    const mine = (rows: Awaited<ReturnType<typeof customerRanking>>) => rows.filter((r) => [big, small].includes(r.id));
    const bySales = mine(await customerRanking("sales", asOf));
    expect(bySales.map((r) => [r.name, n(r.sales), n(r.margin), r.invoices])).toEqual([
      ["Report Big Customer", 12000, 6000, 6],
      ["Report Small Customer", 600, 300, 1],
    ]);
    expect(n(bySales[0].marginPct)).toBe(50);
    expect(bySales[0].lastInvoice?.toISOString().slice(0, 10)).toBe("2039-12-05");
    // Invoices carry VAT, so balances are 14% more than sales.
    expect(n(bySales[0].balance)).toBe(13680);
    expect(n(bySales[1].overdue)).toBe(0);
    const byName = mine(await customerRanking("name", asOf));
    expect(byName.map((r) => r.name)).toEqual(["Report Big Customer", "Report Small Customer"]);
  });

  it("ranks suppliers by purchases in EGP, with what is owed in their currency", async () => {
    const r = (await supplierRanking("purchases", asOf)).find((x) => x.id === supplier)!;
    expect([n(r.purchases), r.shipments, r.country]).toEqual([5000, 1, "Sweden"]);
    expect(r.balances.map((b) => [b.currency, n(b.balance)])).toEqual([["SEK", 1000]]);
    expect(n(r.balance)).toBe(5000); // at the latest SEK rate
  });
});

describe("daily budget", () => {
  it("adds every account in use into EGP", async () => {
    const egp = await db.moneyAccount.create({ data: { name: "Report Cash", kind: "CASH", currency: "EGP", openingBalance: 1500 } });
    const yen = await db.moneyAccount.create({ data: { name: "Report Yen", kind: "BANK", currency: "JPY", openingBalance: 1000, openingFxRate: 0.3 } });
    await db.moneyAccount.create({ data: { name: "Report Closed", kind: "BANK", currency: "EGP", openingBalance: 99, active: false } });
    const cash = await cashPosition();
    expect(cash.rows.filter((r) => [egp.id, yen.id].includes(r.id)).map((r) => [r.name, n(r.balance), n(r.egp)])).toEqual([
      ["Report Yen", 1000, 300],
      ["Report Cash", 1500, 1500],
    ]);
    expect(cash.rows.some((r) => r.name === "Report Closed")).toBe(false);
    expect(n(cash.total)).toBe(cash.rows.reduce((s, r) => s + (n(r.egp) ?? 0), 0));
  });
});

describe("exports", () => {
  it("builds every report, and an Excel file with numbers kept as numbers", async () => {
    const t = translator("en");
    for (const name of ["dashboard", "products", "low-stock", "customers", "suppliers", "receivables", "payables", "accounts", "margin", "profit", "expiry"]) {
      const report = await buildReport(name, new URLSearchParams(), t);
      expect(report?.sections.length, name).toBeGreaterThan(0);
    }
    expect(await buildReport("nothing", new URLSearchParams(), t)).toBeNull();

    const report = (await buildReport("products", new URLSearchParams({ q: "Report", sort: "movement" }), translator("ar")))!;
    expect(report.title).toBe("الأصناف حسب الحركة");
    const book = new ExcelJS.Workbook();
    const file = await reportWorkbook(report, true);
    await book.xlsx.load(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);
    const sheet = book.worksheets[0];
    expect(sheet.views[0].rightToLeft).toBe(true);
    const values = sheet.getSheetValues().filter(Boolean).map((r) => (r as unknown[]).slice(1));
    const first = values.find((r) => r[1] === "Report Fast")!;
    // The report runs to today, before these 2039 sales, so it shows the product as not moving.
    expect([first[2], first[4], first[5], first[12]]).toEqual(["RPT-FAST", "راكد", 0, 400]);
    expect(values.find((r) => r[1] === "Report Idle")![3]).toBe("64-17-5");
  });

  it("exports one product's movements", async () => {
    const report = (await buildReport("product-moves", new URLSearchParams({ id: String(slow) }), translator("en")))!;
    expect(report.sections[0].rows.map((r) => [r[1], n(r[4] as never), n(r[5] as never)])).toEqual([
      ["Opening stock", 1000, null],
      ["Sale", null, 30],
    ]);
  });
});
