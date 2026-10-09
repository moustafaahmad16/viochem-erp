import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { parseInputDate } from "@/lib/dates";
import { buildSheet, readReply } from "@/lib/rfq/sheet";
import { receiveShipment } from "@/lib/services/inventory";
import { addRfqLine, analyseRfq, chooseSuggested, createRfq, inviteSupplier, loadReply, makeOrders, saveQuote, setRate } from "@/lib/services/rfq";

// Dates in 2037 keep these document numbers apart from the other test files.
const d = (s: string) => parseInputDate(s)!;
const n = (v: { toString(): string } | null | undefined) => (v == null ? null : Number(v.toString()));

let itemA: number, itemB: number, s1: number, s2: number, s3: number, rfqId: number, lineA: number, lineB: number;

/** A received shipment, so the supplier has a track record: landed-cost markup and lateness. */
async function history(supplierId: number, ref: string, charges: number, eta: string, arrival: string) {
  const s = await db.shipment.create({
    data: {
      ref, supplierId, currency: "USD", fxRate: 50, orderDate: d("2036-12-01"), eta: d(eta),
      lines: { create: [{ itemId: itemA, qty: 10, unitPrice: 10 }] },
      charges: charges ? { create: [{ kind: "FREIGHT", amountEgp: charges }] } : undefined,
    },
  });
  await receiveShipment(s.id, d(arrival));
}

beforeAll(async () => {
  itemA = (await db.item.create({ data: { code: "RFQ-A", name: "RFQ Linalool" } })).id;
  itemB = (await db.item.create({ data: { code: "RFQ-B", name: "RFQ Vanillin" } })).id;
  s1 = (await db.supplier.create({ data: { name: "RFQ Supplier One", currency: "USD" } })).id;
  s2 = (await db.supplier.create({ data: { name: "RFQ Supplier Two", currency: "CHF" } })).id;
  s3 = (await db.supplier.create({ data: { name: "RFQ Supplier Three", currency: "USD" } })).id;
  await history(s1, "RFQ-T-SHP-1", 500, "2037-01-10", "2037-01-15"); // 10% on top, 5 days late
  await history(s3, "RFQ-T-SHP-3", 0, "2037-01-10", "2037-01-10"); // nothing on top, on time

  const rfq = await createRfq({ date: d("2037-02-01"), replyBy: d("2037-02-10"), neededBy: d("2037-04-01"), notes: "CIF Alexandria", lines: [{ itemId: itemA, qty: 100 }] });
  rfqId = rfq.id;
  lineA = (await db.rfqLine.findFirstOrThrow({ where: { rfqId } })).id;
  lineB = (await addRfqLine(rfqId, { itemId: itemB, qty: 50, notes: null })).id;
  for (const s of [s1, s2, s3]) await inviteSupplier(rfqId, s);
  await setRate(rfqId, "USD", 50);
});

describe("supplier sheet", () => {
  it("goes out with the products and comes back with prices, knowing who it was for", async () => {
    const rfq = await db.rfq.findUniqueOrThrow({ where: { id: rfqId }, include: { lines: { include: { item: true }, orderBy: { id: "asc" } } } });
    const supplier = await db.supplier.findUniqueOrThrow({ where: { id: s1 } });
    const file = await buildSheet({ rfq, supplier, lines: rfq.lines });

    // The supplier fills in the yellow columns.
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(file as unknown as ArrayBuffer);
    const sheet = book.getWorksheet("Quotation")!;
    let head = 0;
    sheet.eachRow((row, i) => { if (row.getCell(1).value === "Ref") head = i; });
    const a = sheet.getRow(head + 1);
    const b = sheet.getRow(head + 2);
    expect([a.getCell(1).value, a.getCell(3).value, a.getCell(5).value, a.getCell(8).value]).toEqual([lineA, "RFQ Linalool", 100, "USD"]);
    a.getCell(7).value = 10; a.getCell(10).value = 30; a.getCell(11).value = "60 days"; a.getCell(12).value = "2037-03-31"; a.getCell(13).value = "cif";
    b.getCell(7).value = "5"; b.getCell(9).value = 80;
    const reply = await readReply((await book.xlsx.writeBuffer()) as ArrayBuffer);

    expect([reply.rfqId, reply.supplierId, reply.errors]).toEqual([rfqId, s1, []]);
    expect(await loadReply(rfqId, null, reply)).toEqual({ supplier: "RFQ Supplier One", priced: 2 });
    const q = await db.rfqQuote.findUniqueOrThrow({ where: { rfqLineId_supplierId: { rfqLineId: lineA, supplierId: s1 } } });
    expect([n(q.unitPrice), q.currency, q.leadTimeDays, q.paymentTermsDays, q.incoterm, q.validUntil?.toISOString().slice(0, 10)]).toEqual([10, "USD", 30, 60, "CIF", "2037-03-31"]);
  });

  it("refuses a sheet made for another request", async () => {
    const other = await createRfq({ date: d("2037-02-02"), replyBy: null, neededBy: null, notes: null });
    await expect(loadReply(other.id, s1, { rfqId, supplierId: s1, number: "RFQ-2037-0001", rows: [], errors: [] })).rejects.toThrow("This sheet is for RFQ-2037-0001, not this one.");
  });
});

describe("comparison", () => {
  beforeAll(async () => {
    // Cheaper landed, but slow: it would arrive after the date needed and gives no credit.
    await saveQuote(rfqId, { lineId: lineA, supplierId: s3, currency: "USD", unitPrice: 10.2, leadTimeDays: 90 });
    await saveQuote(rfqId, { lineId: lineB, supplierId: s3, currency: "USD", unitPrice: 1, validUntil: d("2020-01-01") });
    await saveQuote(rfqId, { lineId: lineB, supplierId: s2, currency: "CHF", unitPrice: 20, leadTimeDays: 20 });
  });

  it("counts landed costs, credit and timing, not just the price", async () => {
    const a = await analyseRfq(rfqId);
    const line = a.lines.find((l) => l.lineId === lineA)!;
    const [first, second] = line.options;
    expect([first.supplierId, second.supplierId]).toEqual([s1, s3]);

    // One: 10 USD × 50 × 1.10 landed = 550; 55,000 for 100, less 60 days credit at 25% a year (2,260.27), plus 1% for running 5 days late.
    expect([n(first.landedUnit), n(first.spend)]).toEqual([550, 55000]);
    expect(n(first.score)).toBeCloseTo((55000 - (55000 * 60 * 0.25) / 365 + 550) / 100, 6);
    expect(first.flags.map((f) => f.kind).sort()).toEqual(["credit", "slow"]);
    // Three: 510 landed, but arriving 2 May after the 1 April need adds 10%.
    expect([n(second.landedUnit), n(second.score)]).toEqual([510, 561]);
    expect(second.flags.map((f) => f.kind)).toEqual(["late"]);
    expect(line.best?.supplierId).toBe(s1);
  });

  it("leaves out expired prices and currencies without a rate, and buys at least the minimum", async () => {
    let b = (await analyseRfq(rfqId)).lines.find((l) => l.lineId === lineB)!;
    const bySupplier = (id: number) => b.options.find((o) => o.supplierId === id)!;
    expect(bySupplier(s3).usable).toBe(false);
    expect(bySupplier(s3).flags.map((f) => f.kind)).toContain("expired");
    expect(bySupplier(s2).flags.map((f) => f.kind)).toContain("noRate");
    expect([n(bySupplier(s1).buyQty), bySupplier(s1).flags.map((f) => f.kind)]).toEqual([80, ["moq", "slow"]]);
    expect(b.best?.supplierId).toBe(s1);

    await setRate(rfqId, "CHF", 55);
    b = (await analyseRfq(rfqId)).lines.find((l) => l.lineId === lineB)!;
    expect(b.options.find((o) => o.supplierId === s2)!.usable).toBe(true);
  });

  it("compares the split with buying everything from one supplier", async () => {
    const a = await analyseRfq(rfqId);
    expect(a.suggestedSuppliers).toBe(1);
    expect(a.singles[0]).toMatchObject({ supplierId: s1 });
    expect(n(a.singles[0].extra)).toBe(0);
    expect(a.singles.some((s) => s.supplierId === s3)).toBe(false); // its B price expired
  });
});

describe("ordering", () => {
  it("chooses the suggestions and makes one purchase order per supplier", async () => {
    await chooseSuggested(rfqId);
    const orders = await makeOrders(rfqId);
    expect(orders).toHaveLength(1);
    const po = await db.purchaseOrder.findUniqueOrThrow({ where: { id: orders[0].id }, include: { lines: { orderBy: { id: "asc" } } } });
    expect([po.supplierId, po.currency, po.expectedDate?.toISOString().slice(0, 10)]).toEqual([s1, "USD", po.date && new Date(po.date.getTime() + 30 * 86_400_000).toISOString().slice(0, 10)]);
    expect(po.lines.map((l) => [l.itemId, n(l.qty), n(l.unitPrice)])).toEqual([[itemA, 100, 10], [itemB, 80, 5]]);
    expect(po.notes).toBe("From RFQ-2037-0001. Incoterm: CIF.");
    expect((await db.rfq.findUniqueOrThrow({ where: { id: rfqId } })).status).toBe("ORDERED");
    await expect(saveQuote(rfqId, { lineId: lineA, supplierId: s2, currency: "EUR", unitPrice: 1 })).rejects.toThrow("Only open requests can be changed.");
  });
});
