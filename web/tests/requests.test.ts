import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { parseInputDate } from "@/lib/dates";
import { addOpeningStock } from "@/lib/services/inventory";
import { addRequestLines, cancelRequest, convertRequest, createRequest, planRequest, setGapHandled, supplyGap } from "@/lib/services/requests";

// Dates in 2032 keep these document numbers apart from the other test files.
const d = (s: string) => parseInputDate(s)!;
const n = (v: { toString(): string } | null) => (v == null ? null : Number(v.toString()));

let inStock: number, empty: number, customer: number, other: number;

beforeAll(async () => {
  inStock = (await db.item.create({ data: { code: "REQ-LIN", name: "Request Linalool", casNumber: "54464-57-2" } })).id;
  empty = (await db.item.create({ data: { code: "REQ-GER", name: "Request Geraniol" } })).id;
  customer = (await db.customer.create({ data: { name: "Request Customer" } })).id;
  other = (await db.customer.create({ data: { name: "Request Other Customer" } })).id;
  await addOpeningStock({ itemId: inStock, qty: 40, unitCostEgp: 100, date: d("2026-01-01"), expiryDate: null, supplierBatchNo: null });
});

describe("customer requests", () => {
  it("numbers them REQ and links a typed-in product to ours by CAS number or name", async () => {
    const r = await createRequest(customer, d("2032-01-05"), [
      { itemId: null, productName: "iso e super", casNumber: "54464572", unit: null, qty: "5" },
      { itemId: null, productName: "request geraniol", casNumber: null, unit: null, qty: "2" },
      { itemId: null, productName: "Request Hedione", casNumber: "24851-98-7", unit: "kg", qty: "3" },
    ]);
    expect(r.number).toMatch(/^REQ-2032-\d{4}$/);
    const lines = await db.customerRequestLine.findMany({ where: { requestId: r.id }, orderBy: { id: "asc" } });
    expect(lines.map((l) => [l.itemId, l.productName, l.casNumber])).toEqual([
      [inStock, null, null],
      [empty, null, null],
      [null, "Request Hedione", "24851-98-7"],
    ]);
    await expect(addRequestLines(r.id, [{ itemId: null, productName: " ", casNumber: null, unit: null, qty: "1" }])).rejects.toThrow(/Choose a product/);
    await expect(addRequestLines(r.id, [{ itemId: inStock, productName: null, casNumber: null, unit: null, qty: "0" }])).rejects.toThrow(/more than 0/);
  });

  it("splits each line into what is free in stock and what is missing, sharing stock across lines", async () => {
    const plan = await planRequest([
      { id: 1, itemId: inStock, qty: "30" },
      { id: 2, itemId: inStock, qty: "30" },
      { id: 3, itemId: empty, qty: "10" },
      { id: 4, itemId: null, qty: "7" },
    ]);
    expect(plan.map((p) => [p.kind, n(p.quote), n(p.gap)])).toEqual([
      ["stock", 30, 0],
      ["partial", 10, 20],
      ["none", 0, 10],
      ["not-ours", 0, 7],
    ]);
  });

  it("sends free stock to a quotation and the rest to the supply gap, with who asked", async () => {
    const r = await createRequest(customer, d("2032-02-01"), [
      { itemId: inStock, productName: null, casNumber: null, unit: null, qty: "50" },
      { itemId: empty, productName: null, casNumber: null, unit: null, qty: "8" },
      { itemId: null, productName: "Ethyl Vanillin", casNumber: null, unit: "kg", qty: "4" },
    ], "Urgent");
    const res = await convertRequest(r.id, "NON_TAXED", d("2032-02-01"));
    expect(res).toMatchObject({ quoted: 1, gaps: 3 });

    const q = await db.quote.findUniqueOrThrow({ where: { id: res.quoteId! }, include: { lines: true, request: true } });
    expect(q).toMatchObject({ customerId: customer, status: "OPEN", kind: "NON_TAXED", notes: "Urgent" });
    expect(q.request?.id).toBe(r.id);
    expect(q.lines.map((l) => [l.itemId, n(l.qty), n(l.unitPrice)])).toEqual([[inStock, 40, 0]]);

    const after = await db.customerRequest.findUniqueOrThrow({ where: { id: r.id }, include: { lines: { orderBy: { id: "asc" } } } });
    expect(after.status).toBe("CONVERTED");
    expect(after.lines.map((l) => [n(l.quotedQty), n(l.gapQty)])).toEqual([[40, 10], [0, 8], [0, 4]]);
    await expect(convertRequest(r.id)).rejects.toThrow(/Only open requests/);

    // A second customer asks for the same products we don't have.
    const r2 = await createRequest(other, d("2032-02-10"), [
      { itemId: empty, productName: null, casNumber: null, unit: null, qty: "2" },
      { itemId: null, productName: "ethyl  vanillin", casNumber: null, unit: "kg", qty: "1" },
    ]);
    const res2 = await convertRequest(r2.id, "TAXED", d("2032-02-10"));
    expect(res2.quoteId).toBeNull();

    const gap = await supplyGap({ since: d("2032-01-01") });
    const ger = gap.ours.find((g) => g.itemId === empty)!;
    expect([n(ger.qty), ger.customers, ger.requests.length, n(ger.free!)]).toEqual([10, ["Request Other Customer", "Request Customer"], 2, 0]);
    expect(gap.ours.find((g) => g.itemId === inStock)!.qty.toString()).toBe("10");
    const ev = gap.local.find((g) => g.name === "Ethyl Vanillin" || g.name === "ethyl  vanillin")!;
    expect([n(ev.qty), ev.requests.length]).toEqual([5, 2]);

    // Dealt with: it leaves the open list and shows among the handled ones.
    await setGapHandled(ger.requests.map((x) => x.lineId), true);
    expect((await supplyGap({ since: d("2032-01-01") })).ours.some((g) => g.itemId === empty)).toBe(false);
    expect((await supplyGap({ since: d("2032-01-01"), handled: true })).ours.find((g) => g.itemId === empty)?.requests.length).toBe(2);
  });

  it("leaves cancelled and unsent requests out of the supply gap", async () => {
    const r = await createRequest(customer, d("2032-03-01"), [{ itemId: null, productName: "Request Ambroxan", casNumber: null, unit: null, qty: "9" }]);
    expect((await supplyGap()).local.some((g) => g.name === "Request Ambroxan")).toBe(false);
    await cancelRequest(r.id);
    await expect(convertRequest(r.id)).rejects.toThrow(/Only open requests/);
    expect((await supplyGap()).local.some((g) => g.name === "Request Ambroxan")).toBe(false);
  });
});
