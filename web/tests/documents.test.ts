import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { parseInputDate } from "@/lib/dates";
import { addShipmentDocument, BUILT_IN_TYPES, documentType, documentTypes, removeShipmentDocument, shipmentDocuments } from "@/lib/services/documents";
import { createShipment } from "@/lib/services/inventory";

let shipment: number;
const pdf = (text: string) => ({ name: "invoice.pdf", type: "application/pdf", bytes: new TextEncoder().encode(text) });

beforeAll(async () => {
  const supplier = (await db.supplier.create({ data: { name: "Documents Supplier", currency: "USD" } })).id;
  shipment = (
    await createShipment({
      supplierId: supplier, currency: "USD", fxRate: "48", orderDate: parseInputDate("2026-10-01")!, etd: null, eta: null,
      supplierInvoiceNo: "INV-9", acidNumber: "4123456789012345678", allocation: "VALUE", notes: null,
    })
  ).id;
});

describe("shipment documents", () => {
  it("keeps the ACID number on the shipment", async () => {
    expect((await db.shipment.findUniqueOrThrow({ where: { id: shipment } })).acidNumber).toBe("4123456789012345678");
  });

  it("lists the four standard types first, in order", async () => {
    const types = await documentTypes();
    expect(types.slice(0, 4).map((t) => t.name)).toEqual(BUILT_IN_TYPES);
    expect(types.slice(0, 4).every((t) => t.builtIn)).toBe(true);
  });

  it("stores the file and gives it back unchanged", async () => {
    const [proforma] = await documentTypes();
    const { id } = await addShipmentDocument(shipment, proforma.id, pdf("%PDF-1.4 hello"));
    const [doc] = await shipmentDocuments(shipment);
    expect(doc).toMatchObject({ id, fileName: "invoice.pdf", mimeType: "application/pdf", size: 14 });
    expect(doc).not.toHaveProperty("content");
    const stored = await db.shipmentDocument.findUniqueOrThrow({ where: { id } });
    expect(new TextDecoder().decode(stored.content)).toBe("%PDF-1.4 hello");
  });

  it("refuses empty and oversized files", async () => {
    const [proforma] = await documentTypes();
    await expect(addShipmentDocument(shipment, proforma.id, pdf(""))).rejects.toThrow("Choose a file to upload.");
    const big = { name: "big.pdf", type: "application/pdf", bytes: new Uint8Array(15 * 1024 * 1024 + 1) };
    await expect(addShipmentDocument(shipment, proforma.id, big)).rejects.toThrow("too big");
  });

  it("lets people name their own types, reusing one that differs only in case or spaces", async () => {
    const bl = await documentType("  Bill of  Lading ");
    expect(bl).toMatchObject({ name: "Bill of Lading", builtIn: false });
    expect((await documentType("bill of lading")).id).toBe(bl.id);
    expect((await documentType("packing list")).name).toBe("Packing List");
    await expect(documentType("   ")).rejects.toThrow("Type a name");
  });

  it("drops a custom type once its last file is removed, but never a standard one", async () => {
    const custom = await documentType("Health Certificate");
    const [proforma] = await documentTypes();
    const a = await addShipmentDocument(shipment, custom.id, pdf("one"));
    const b = await addShipmentDocument(shipment, custom.id, pdf("two"));
    await removeShipmentDocument(shipment, a.id);
    expect(await db.documentType.findUnique({ where: { id: custom.id } })).not.toBeNull();
    await removeShipmentDocument(shipment, b.id);
    expect(await db.documentType.findUnique({ where: { id: custom.id } })).toBeNull();

    const p = (await shipmentDocuments(shipment)).find((doc) => doc.typeId === proforma.id)!;
    await removeShipmentDocument(shipment, p.id);
    expect(await db.documentType.findUnique({ where: { id: proforma.id } })).not.toBeNull();
  });

  it("deletes the documents with their shipment", async () => {
    const [, commercial] = await documentTypes();
    await addShipmentDocument(shipment, commercial.id, pdf("x"));
    await db.shipment.delete({ where: { id: shipment } });
    expect(await db.shipmentDocument.count({ where: { shipmentId: shipment } })).toBe(0);
  });
});
