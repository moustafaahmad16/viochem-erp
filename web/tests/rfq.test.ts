import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { parseInputDate } from "@/lib/dates";
import { buildSheet, readReply } from "@/lib/rfq/sheet";
import { receiveShipment } from "@/lib/services/inventory";
import { addRfqLine, analyseRfq, createRfq, dayMonthSwapped, inviteSupplier, loadReply, orderSuggested, saveLines, saveQuote, setRate } from "@/lib/services/rfq";

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
  it("goes out the same to everyone and comes back with prices, matched by the name written on it", async () => {
    const rfq = await db.rfq.findUniqueOrThrow({ where: { id: rfqId }, include: { lines: { include: { item: true }, orderBy: { id: "asc" } } } });
    const file = await buildSheet({ rfq, lines: rfq.lines });

    // The supplier fills in the yellow columns.
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(file as unknown as ArrayBuffer);
    const sheet = book.getWorksheet("Quotation")!;
    let head = 0;
    sheet.eachRow((row, i) => {
      if (row.getCell(1).value === "Ref") head = i;
      if (row.getCell(1).value === "Supplier") row.getCell(3).value = " rfq supplier ONE ";
    });
    const a = sheet.getRow(head + 1);
    const b = sheet.getRow(head + 2);
    expect([a.getCell(1).value, a.getCell(3).value, a.getCell(5).value]).toEqual([lineA, "RFQ Linalool", 100]);
    a.getCell(7).value = 10; a.getCell(8).value = "usd"; a.getCell(10).value = 30; a.getCell(11).value = "60 days"; a.getCell(12).value = "2037-03-31"; a.getCell(13).value = "cif";
    b.getCell(7).value = "5"; b.getCell(9).value = 80;
    const reply = await readReply((await book.xlsx.writeBuffer()) as ArrayBuffer);

    expect([reply.rfqId, reply.supplierId, reply.supplierName, reply.errors]).toEqual([rfqId, null, "rfq supplier ONE", []]);
    expect(await loadReply(rfqId, null, reply)).toEqual({ supplier: "RFQ Supplier One", priced: 2, swapped: [] });
    const q = await db.rfqQuote.findUniqueOrThrow({ where: { rfqLineId_supplierId: { rfqLineId: lineA, supplierId: s1 } } });
    expect([n(q.unitPrice), q.currency, q.leadTimeDays, q.paymentTermsDays, q.incoterm, q.validUntil?.toISOString().slice(0, 10)]).toEqual([10, "USD", 30, 60, "CIF", "2037-03-31"]);
  });

  it("adds a supplier it doesn't know yet, in the currency they quoted", async () => {
    const reply = { rfqId, supplierId: null, supplierName: "RFQ Brand New Trading", number: null, errors: [], rows: [{ row: 12, lineId: lineA, unitPrice: "99", currency: "GBP", moq: null, leadTimeDays: null, paymentTermsDays: null, validUntil: null, incoterm: null, notes: null }] };
    expect(await loadReply(rfqId, null, reply)).toEqual({ supplier: "RFQ Brand New Trading", priced: 1, swapped: [] });
    const created = await db.supplier.findUniqueOrThrow({ where: { name: "RFQ Brand New Trading" } });
    expect(created.currency).toBe("GBP");
    await expect(loadReply(rfqId, null, { ...reply, supplierName: null })).rejects.toThrow("The supplier's name isn't on the sheet. Choose who sent it.");
    // Not part of the comparison below.
    await db.rfqQuote.deleteMany({ where: { supplierId: created.id } });
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

describe("expired prices", () => {
  it("still suggests the cheapest when every price has expired, flagged to confirm", async () => {
    const rfq = await createRfq({ date: d("2037-03-01"), replyBy: null, neededBy: null, notes: null, lines: [{ itemId: itemB, qty: 10 }] });
    const line = (await db.rfqLine.findFirstOrThrow({ where: { rfqId: rfq.id } })).id;
    for (const s of [s1, s3]) await inviteSupplier(rfq.id, s);
    await setRate(rfq.id, "USD", 50);
    await saveQuote(rfq.id, { lineId: line, supplierId: s1, currency: "USD", unitPrice: 2, validUntil: d("2020-01-11") });
    await saveQuote(rfq.id, { lineId: line, supplierId: s3, currency: "USD", unitPrice: 1, validUntil: d("2020-01-12") });
    const b = (await analyseRfq(rfq.id)).lines[0];
    expect(b.options.every((o) => !o.usable)).toBe(true);
    expect(b.best?.supplierId).toBe(s3);
    expect(b.best?.flags.map((f) => f.kind)).toContain("expired");
  });

  it("reads a date before the request with day and month swapped, when that makes sense", () => {
    const rfqDate = d("2026-10-01");
    expect(dayMonthSwapped(d("2026-01-11"), rfqDate)?.toISOString().slice(0, 10)).toBe("2026-11-01");
    expect(dayMonthSwapped(d("2026-01-12"), rfqDate)?.toISOString().slice(0, 10)).toBe("2026-12-01");
    expect(dayMonthSwapped(d("2026-12-01"), rfqDate)).toBeNull(); // already after the request
    expect(dayMonthSwapped(d("2026-01-20"), rfqDate)).toBeNull(); // no 20th month
    expect(dayMonthSwapped(d("2026-02-03"), rfqDate)).toBeNull(); // 2 March is still before
  });
});

describe("products", () => {
  it("saves the list as shown: changed quantities, new products, and removed ones", async () => {
    const r = await createRfq({ date: d("2037-03-01"), replyBy: null, neededBy: null, notes: null, lines: [{ itemId: itemA, qty: 10 }] });
    await saveLines(r.id, [{ itemId: itemA, qty: 15 }, { itemId: itemB, qty: 5 }]);
    let lines = await db.rfqLine.findMany({ where: { rfqId: r.id }, orderBy: { id: "asc" } });
    expect(lines.map((l) => [l.itemId, n(l.qty)])).toEqual([[itemA, 15], [itemB, 5]]);
    await saveLines(r.id, [{ itemId: itemB, qty: 7 }]);
    lines = await db.rfqLine.findMany({ where: { rfqId: r.id } });
    expect(lines.map((l) => [l.itemId, n(l.qty)])).toEqual([[itemB, 7]]);
    await expect(saveLines(r.id, [{ itemId: itemB, qty: 1 }, { itemId: itemB, qty: 2 }])).rejects.toThrow("A product is listed twice.");
  });
});

describe("ordering", () => {
  it("chooses the suggestions and makes one purchase order per supplier", async () => {
    const orders = await orderSuggested(rfqId);
    expect(orders).toHaveLength(1);
    const po = await db.purchaseOrder.findUniqueOrThrow({ where: { id: orders[0].id }, include: { lines: { orderBy: { id: "asc" } } } });
    expect([po.supplierId, po.currency, po.expectedDate?.toISOString().slice(0, 10)]).toEqual([s1, "USD", po.date && new Date(po.date.getTime() + 30 * 86_400_000).toISOString().slice(0, 10)]);
    expect(po.lines.map((l) => [l.itemId, n(l.qty), n(l.unitPrice)])).toEqual([[itemA, 100, 10], [itemB, 80, 5]]);
    expect(po.notes).toBe("From RFQ-2037-0001. Incoterm: CIF.");
    expect((await db.rfq.findUniqueOrThrow({ where: { id: rfqId } })).status).toBe("ORDERED");
    await expect(saveQuote(rfqId, { lineId: lineA, supplierId: s2, currency: "EUR", unitPrice: 1 })).rejects.toThrow("Only open requests can be changed.");
  });
});
