import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { parseInputDate } from "@/lib/dates";
import { addBatchLine, allBatches, batchesMissing, batchName, expiresSoon, isExpired, saveBatch, splitBatch } from "@/lib/services/batches";
import { shipmentDocuments } from "@/lib/services/documents";
import { createInvoice, createShipment, postInvoice, receiveShipment } from "@/lib/services/inventory";

// Dates in 2039 keep these document numbers apart from the other test files.
const d = (s: string) => parseInputDate(s)!;
const num = (v: { toString(): string }) => Number(v.toString());
const pdf = (name: string) => ({ name, type: "application/pdf", bytes: new TextEncoder().encode(`%PDF ${name}`) });

let item: number, supplier: number, customer: number, shipmentId: number;

beforeAll(async () => {
  item = (await db.item.create({ data: { code: "BAT-LIN", name: "Batch Linalool" } })).id;
  supplier = (await db.supplier.create({ data: { name: "Batch Supplier", currency: "USD" } })).id;
  customer = (await db.customer.create({ data: { name: "Batch Customer" } })).id;
  shipmentId = (await createShipment({ supplierId: supplier, currency: "USD", fxRate: "50", orderDate: d("2039-01-05"), etd: null, eta: null, supplierInvoiceNo: null, allocation: "VALUE", notes: null })).id;
});

describe("batches on a shipment", () => {
  it("takes one product in two batches, each with its own certificate, and won't receive until all are there", async () => {
    const first = await addBatchLine(shipmentId, { itemId: item, qty: "600", unitPrice: "10", supplierBatchNo: "L-2301", manufactureDate: d("2025-01-10"), expiryDate: d("2039-06-30"), certificate: pdf("coa-2301.pdf") });
    // The second batch is split off the first: the shipment's total stays 600 kg.
    const second = await splitBatch(shipmentId, first.id, "200");
    expect([num((await db.shipmentLine.findUniqueOrThrow({ where: { id: first.id } })).qty), num(second.qty), num(second.unitPrice)]).toEqual([400, 200, 10]);
    await expect(splitBatch(shipmentId, first.id, "400")).rejects.toThrow("The new batch's quantity must be more than 0 and less than 400.");

    expect(await batchesMissing(shipmentId)).toEqual([expect.objectContaining({ id: second.id, batchNo: true, certificate: true })]);
    await saveBatch(shipmentId, second.id, { supplierBatchNo: " L-2302 ", manufactureDate: d("2025-02-01"), expiryDate: d("2041-01-31") });
    expect(await batchesMissing(shipmentId)).toEqual([expect.objectContaining({ id: second.id, batchNo: false, certificate: true })]);
    await saveBatch(shipmentId, second.id, { supplierBatchNo: "L-2302", manufactureDate: d("2025-02-01"), expiryDate: d("2041-01-31"), certificate: pdf("coa-2302.pdf") });
    expect(await batchesMissing(shipmentId)).toEqual([]);

    // A new certificate replaces the old one, and certificates stay out of the shipment's own documents.
    await saveBatch(shipmentId, second.id, { supplierBatchNo: "L-2302", manufactureDate: d("2025-02-01"), expiryDate: d("2041-01-31"), certificate: pdf("coa-2302-v2.pdf") });
    expect((await db.shipmentDocument.findMany({ where: { shipmentLineId: second.id } })).map((c) => c.fileName)).toEqual(["coa-2302-v2.pdf"]);
    expect(await shipmentDocuments(shipmentId)).toEqual([]);

    await expect(saveBatch(shipmentId, second.id, { supplierBatchNo: "X", manufactureDate: d("2025-02-01"), expiryDate: d("2025-01-01") })).rejects.toThrow("The expiry date must be after the manufacturing date.");
  });

  it("receives each batch as its own stock batch, keeping its dates and certificate", async () => {
    await receiveShipment(shipmentId, d("2039-02-01"));
    const batches = await allBatches({ itemId: item });
    expect(batches.map((b) => [batchName(b), num(b.qtyOnHand), b.manufactureDate?.toISOString().slice(0, 10), b.certificate?.fileName])).toEqual([
      ["L-2302", 200, "2025-02-01", "coa-2302-v2.pdf"],
      ["L-2301", 400, "2025-01-10", "coa-2301.pdf"],
    ]);
    // After receiving, the batch details are fixed; only a certificate can still be added.
    const line = batches[0].shipmentLineId!;
    await expect(saveBatch(shipmentId, line, { supplierBatchNo: "Y", manufactureDate: null, expiryDate: null })).rejects.toThrow(/can't change/);
  });
});

describe("expired batches", () => {
  it("are skipped when selling, earliest expiry first among the rest", async () => {
    // On 1 Jan 2040 batch L-2301 (expiry 30 Jun 2039) has expired; only L-2302's 200 kg can be sold.
    const inv = await createInvoice(customer, d("2040-01-01"));
    await db.invoiceLine.create({ data: { invoiceId: inv.id, itemId: item, qty: 300, unitPrice: 20 } });
    await expect(postInvoice(inv.id)).rejects.toThrow("Not enough Batch Linalool in stock on that date: 200 kg available. Another 400 kg has expired and can't be sold.");

    await db.invoiceLine.updateMany({ where: { invoiceId: inv.id }, data: { qty: 150 } });
    await postInvoice(inv.id);
    const moves = await db.stockMove.findMany({ where: { invoiceLine: { invoiceId: inv.id } }, include: { lot: true } });
    expect(moves.map((m) => [m.lot.supplierBatchNo, num(m.qty)])).toEqual([["L-2302", -150]]);
  });

  it("can't be chosen by hand", async () => {
    const expired = await db.lot.findFirstOrThrow({ where: { supplierBatchNo: "L-2301" } });
    const inv = await createInvoice(customer, d("2040-01-02"));
    await db.invoiceLine.create({ data: { invoiceId: inv.id, itemId: item, lotId: expired.id, qty: 1, unitPrice: 20 } });
    await expect(postInvoice(inv.id)).rejects.toThrow("Batch L-2301 of Batch Linalool expired on 30 Jun 2039, so it can't be sold.");
  });

  it("are told apart from ones expiring soon", () => {
    const on = d("2039-06-01");
    expect([isExpired({ expiryDate: d("2039-05-31") }, on), isExpired({ expiryDate: on }, on), expiresSoon({ expiryDate: d("2039-08-01") }, on), expiresSoon({ expiryDate: d("2040-01-01") }, on), expiresSoon({ expiryDate: null }, on)]).toEqual([true, false, true, false, false]);
  });
});
