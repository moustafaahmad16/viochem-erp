import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { parseInputDate } from "@/lib/dates";
import { buildDocument, issuedAt, problems, serialize, type Party } from "@/lib/eta/document";
import { refreshStatus, sendInvoice, textToSign } from "@/lib/services/einvoice";
import { signingMode } from "@/lib/eta/client";
import { addOpeningStock, createInvoice, postInvoice } from "@/lib/services/inventory";

const issuer: Party = { type: "B", id: "100324932", name: "VIOCHEM", country: "EG", governate: "Cairo", city: "Nasr City", street: "Abbas El Akkad", buildingNo: "12", branchId: "0" };
const receiver: Party = { type: "B", id: "200111222", name: "Fragrance Co", country: "EG", governate: "Giza", city: "6th of October", street: "Industrial Zone", buildingNo: "7" };
const line = (qty: number, unitPrice: number) => ({ description: "Linalool", itemType: "EGS", itemCode: "EG-1", unitType: "KGM", internalCode: "LIN", qty, unitPrice, vatRate: 14 });

describe("ETA documents", () => {
  it("serializes names, values and arrays the way ETA signs them", () => {
    expect(serialize({ a: "x", nested: { b: 1.5 }, items: [{ c: "1" }, { c: "2" }] })).toBe('"A""x""NESTED""B""1.5""ITEMS""ITEMS""C""1""ITEMS""C""2"');
    // Numbers are written exactly as JSON.stringify sends them.
    expect(serialize({ amount: 0, qty: 100, rate: 14.5 })).toBe('"AMOUNT""0""QTY""100""RATE""14.5"');
  });

  it("works out line and invoice totals", () => {
    const doc = buildDocument({ issuer, receiver, internalId: "INV-2026-0001", dateTimeIssued: "2026-10-08T10:00:00Z", activityCode: "4669", version: "1.0", lines: [line(25, 480), line(3, 333.33333)] });
    expect(doc.invoiceLines[0]).toMatchObject({ salesTotal: 12000, netTotal: 12000, total: 13680, taxableItems: [{ taxType: "T1", amount: 1680, subType: "V009", rate: 14 }] });
    expect([doc.totalSalesAmount, doc.netAmount, doc.taxTotals[0].amount, doc.totalAmount]).toEqual([12999.99999, 12999.99999, 1820, 14819.99999]);
    expect(doc.issuer.address).toMatchObject({ branchID: "0", regionCity: "Nasr City" });
    expect("branchID" in doc.receiver.address).toBe(false);
  });

  it("never dates a document in the future", () => {
    const now = new Date("2026-10-08T06:00:00Z"); // 09:00 in Cairo
    expect(issuedAt(new Date("2026-10-07T00:00:00Z"), null, now)).toBe("2026-10-07T08:00:00Z");
    expect(issuedAt(new Date("2026-10-08T00:00:00Z"), null, now)).toBe("2026-10-08T05:59:00Z");
    expect(issuedAt(new Date("2026-10-08T00:00:00Z"), new Date("2026-10-08T05:30:12.345Z"), now)).toBe("2026-10-08T05:30:12Z");
  });

  it("lists what is missing", () => {
    const base = { issuer, activityCode: "4669", receiver: { ...receiver, label: "Fragrance Co" }, lines: [{ ...line(1, 1), productName: "Linalool" }], total: 100 };
    expect(problems(base)).toEqual([]);
    expect(problems({ ...base, issuer: { ...issuer, id: "" }, activityCode: "", receiver: { ...base.receiver, id: "123", street: "" }, lines: [{ ...base.lines[0], itemCode: "" }] })).toEqual([
      "VIOCHEM's tax registration number (9 digits) isn't set in E-invoice settings.",
      "The activity code isn't set in E-invoice settings.",
      "Fragrance Co needs a 9-digit tax registration number.",
      "Fragrance Co needs governorate, city, street and building number.",
      "Linalool has no ETA item code.",
    ]);
    // A person buying under EGP 50,000 needs no ID or address.
    expect(problems({ ...base, receiver: { ...base.receiver, type: "P", id: "", street: "" }, total: 49999 })).toEqual([]);
  });
});

describe("sending to ETA", () => {
  let invoiceId: number;
  const d = (s: string) => parseInputDate(s)!;

  beforeAll(async () => {
    process.env.ETA_CLIENT_ID = "client";
    process.env.ETA_CLIENT_SECRET = "secret";
    await db.etaSettings.upsert({ where: { id: 1 }, create: {}, update: {} });
    await db.etaSettings.update({ where: { id: 1 }, data: { taxId: "100324932", activityCode: "4669", governate: "Cairo", city: "Nasr City", street: "Abbas El Akkad", buildingNo: "12", documentVersion: "0.9" } });
    const item = await db.item.create({ data: { code: "ETA-ITEM", name: "Geraniol", etaItemCode: "EG-100324932-GER" } });
    const customer = await db.customer.create({ data: { name: "ETA Customer", taxId: "200111222", governate: "Giza", city: "Dokki", street: "Tahrir", buildingNo: "5" } });
    await addOpeningStock({ itemId: item.id, qty: 10, unitCostEgp: 100, date: d("2022-01-01"), expiryDate: null, supplierBatchNo: null });
    const inv = await createInvoice(customer.id, d("2022-02-01"));
    await db.invoiceLine.create({ data: { invoiceId: inv.id, itemId: item.id, qty: 2, unitPrice: 500 } });
    await postInvoice(inv.id);
    invoiceId = inv.id;
  });
  afterEach(() => vi.unstubAllGlobals());

  const respond = (routes: Record<string, unknown>) =>
    vi.fn(async (...[url]: [string, RequestInit?]) => {
      const key = Object.keys(routes).find((k) => url.includes(k));
      return new Response(JSON.stringify(routes[key!]), { status: key === "documentsubmissions" ? 202 : 200 });
    });

  it("keeps a rejection's reasons so they can be fixed", async () => {
    vi.stubGlobal("fetch", respond({ "connect/token": { access_token: "t" }, documentsubmissions: { acceptedDocuments: [], rejectedDocuments: [{ internalId: "x", error: { message: "Validation Error", details: [{ propertyPath: "receiver.id", message: "Invalid taxpayer" }] } }] } }));
    const inv = await sendInvoice(invoiceId);
    expect(inv.etaStatus).toBe("REJECTED");
    expect(inv.etaError).toBe("Validation Error\nreceiver.id: Invalid taxpayer");
  });

  it("stores the ETA id when accepted, then its final status", async () => {
    const fetch = respond({ "connect/token": { access_token: "t" }, documentsubmissions: { submissionId: "S1", acceptedDocuments: [{ uuid: "U1", longId: "L1", internalId: "x" }], rejectedDocuments: [] }, "/details": { status: "Valid" } });
    vi.stubGlobal("fetch", fetch);
    let inv = await sendInvoice(invoiceId);
    expect([inv.etaStatus, inv.etaUuid, inv.etaLongId, inv.etaSubmissionUuid, inv.etaError]).toEqual(["SUBMITTED", "U1", "L1", "S1", null]);
    const sent = JSON.parse(String(fetch.mock.calls[1][1]!.body)).documents[0];
    expect(sent).toMatchObject({ internalID: inv.number, documentTypeVersion: "0.9", totalAmount: 1140 });
    expect(sent.signatures).toBeUndefined();
    await expect(sendInvoice(invoiceId)).rejects.toThrow(/already with the tax authority/);

    inv = await refreshStatus(invoiceId);
    expect(inv.etaStatus).toBe("VALID");
  });

  it("sends a version 1.0 invoice with the signature made by the e-seal next to the browser", async () => {
    await db.etaSettings.update({ where: { id: 1 }, data: { documentVersion: "1.0" } });
    expect([signingMode("0.9"), signingMode("1.0")]).toEqual(["none", "browser"]);
    const source = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { lines: true } });
    const inv = await createInvoice(source.customerId, d("2022-02-02"));
    await db.invoiceLine.create({ data: { invoiceId: inv.id, itemId: source.lines[0].itemId, qty: 1, unitPrice: 500 } });
    await postInvoice(inv.id);

    const { serialized, number } = await textToSign("invoice", inv.id);
    expect(number).toBe(inv.number);
    expect(serialized).toContain(`"INTERNALID""${inv.number}"`);
    await expect(sendInvoice(inv.id, { serialized: serialized.replace("500", "5"), signature: "SIG" })).rejects.toThrow(/changed while it was being signed/);

    const fetch = respond({ "connect/token": { access_token: "t" }, documentsubmissions: { submissionId: "S2", acceptedDocuments: [{ uuid: "U2", longId: "L2", internalId: inv.number }], rejectedDocuments: [] } });
    vi.stubGlobal("fetch", fetch);
    const sent = await sendInvoice(inv.id, { serialized, signature: "SIG" });
    expect(sent.etaStatus).toBe("SUBMITTED");
    const doc = JSON.parse(String(fetch.mock.calls[1][1]!.body)).documents[0];
    expect(doc.signatures).toEqual([{ signatureType: "I", value: "SIG" }]);
    const { signatures, ...unsigned } = doc;
    expect(signatures).toBeDefined();
    expect(serialize(unsigned)).toBe(serialized);
    await db.etaSettings.update({ where: { id: 1 }, data: { documentVersion: "0.9" } });
  });
});
