import Decimal from "decimal.js";
import { db, type Tx } from "@/lib/db";
import { addDays, today } from "@/lib/dates";
import { documentType, MAX_DOCUMENT_BYTES } from "./documents";
import { UserError } from "./errors";

/**
 * Batches. Each shipment line is one batch from the supplier: its batch number, manufacturing and
 * expiry dates, and its test certificate. A product that arrives in two batches is two lines, each
 * with its own certificate. Receiving turns each line into a stock batch (a Lot) that keeps them.
 */

/** The document type every test certificate is filed under. */
export const CERTIFICATE_TYPE = "Test certificate (COA)";

/** Batches expiring within this many days are flagged when selling. */
export const NEAR_EXPIRY_DAYS = 90;

/** Expired on a date: the expiry date has passed. A batch is still sellable on its expiry date itself. */
export function isExpired(batch: { expiryDate: Date | null }, on: Date = today()) {
  return batch.expiryDate !== null && batch.expiryDate < on;
}

export function expiresSoon(batch: { expiryDate: Date | null }, on: Date = today()) {
  return batch.expiryDate !== null && !isExpired(batch, on) && batch.expiryDate <= addDays(on, NEAR_EXPIRY_DAYS);
}

/** How a batch is named on screen: the supplier's batch number, else the number given when it came in. */
export function batchName(batch: { supplierBatchNo: string | null; lotNo: string }) {
  return batch.supplierBatchNo ?? batch.lotNo;
}

function checkDates(manufactureDate: Date | null, expiryDate: Date | null) {
  if (manufactureDate && expiryDate && expiryDate <= manufactureDate) throw new UserError("The expiry date must be after the manufacturing date.");
  if (manufactureDate && manufactureDate > today()) throw new UserError("The manufacturing date can't be in the future.");
}

async function line(tx: Tx, shipmentId: number, lineId: number) {
  const l = await tx.shipmentLine.findFirst({ where: { id: lineId, shipmentId }, include: { shipment: true } });
  if (!l) throw new UserError("That product isn't on this shipment.");
  return l;
}

type Certificate = { name: string; type: string; bytes: Uint8Array };

/** The certificate document type, looked up before a transaction starts (SQLite allows one writer at a time). */
async function certificateType(file: Certificate | null | undefined) {
  if (!file) return null;
  if (file.bytes.length > MAX_DOCUMENT_BYTES) throw new UserError("The certificate is too big. The most is 15 MB.");
  return (await documentType(CERTIFICATE_TYPE)).id;
}

/** File a batch's test certificate, replacing the one it had. */
async function attachCertificate(tx: Tx, shipmentId: number, lineId: number, typeId: number, file: Certificate) {
  await tx.shipmentDocument.deleteMany({ where: { shipmentLineId: lineId } });
  await tx.shipmentDocument.create({
    data: {
      shipmentId,
      shipmentLineId: lineId,
      typeId,
      fileName: file.name.slice(0, 200) || "certificate",
      mimeType: file.type || "application/octet-stream",
      size: file.bytes.length,
      content: Buffer.from(file.bytes),
    },
  });
}

export type BatchDetails = { supplierBatchNo: string | null; manufactureDate: Date | null; expiryDate: Date | null; certificate?: Certificate | null };

/**
 * Set a batch's number and dates, and its certificate when one is given. Before receiving everything
 * can change; after, the stock batch already carries the dates, so only a missing certificate can be added.
 */
export async function saveBatch(shipmentId: number, lineId: number, input: BatchDetails) {
  checkDates(input.manufactureDate, input.expiryDate);
  const typeId = await certificateType(input.certificate);
  return db.$transaction(async (tx) => {
    const l = await line(tx, shipmentId, lineId);
    if (l.shipment.status === "RECEIVED") {
      if (!input.certificate) throw new UserError("This shipment is received, so its batch details can't change. You can still upload a certificate.");
    } else {
      await tx.shipmentLine.update({ where: { id: lineId }, data: { supplierBatchNo: input.supplierBatchNo?.trim() || null, manufactureDate: input.manufactureDate, expiryDate: input.expiryDate } });
    }
    if (input.certificate && typeId) await attachCertificate(tx, shipmentId, lineId, typeId, input.certificate);
  });
}

/** Add a product line, which is one batch, with its certificate if it is to hand. */
export async function addBatchLine(shipmentId: number, input: { itemId: number; qty: string; unitPrice: string } & BatchDetails) {
  checkDates(input.manufactureDate, input.expiryDate);
  const typeId = await certificateType(input.certificate);
  return db.$transaction(async (tx) => {
    const s = await tx.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
    if (s.status === "RECEIVED") throw new UserError("This shipment is already received, so its products can't change.");
    const created = await tx.shipmentLine.create({
      data: {
        shipmentId,
        itemId: input.itemId,
        qty: input.qty,
        unitPrice: input.unitPrice,
        supplierBatchNo: input.supplierBatchNo?.trim() || null,
        manufactureDate: input.manufactureDate,
        expiryDate: input.expiryDate,
      },
    });
    if (input.certificate && typeId) await attachCertificate(tx, shipmentId, created.id, typeId, input.certificate);
    return created;
  });
}

/**
 * Split part of a line off into another batch of the same product, at the same price and from the
 * same purchase order line, so the shipment's total doesn't change.
 */
export async function splitBatch(shipmentId: number, lineId: number, qty: Decimal.Value) {
  const part = new Decimal(qty);
  return db.$transaction(async (tx) => {
    const l = await line(tx, shipmentId, lineId);
    if (l.shipment.status === "RECEIVED") throw new UserError("This shipment is already received, so its products can't change.");
    if (part.lte(0) || part.gte(new Decimal(l.qty.toString()))) throw new UserError(`The new batch's quantity must be more than 0 and less than ${l.qty.toString()}.`);
    await tx.shipmentLine.update({ where: { id: lineId }, data: { qty: new Decimal(l.qty.toString()).minus(part).toString() } });
    return tx.shipmentLine.create({ data: { shipmentId, itemId: l.itemId, qty: part.toString(), unitPrice: l.unitPrice, orderLineId: l.orderLineId } });
  });
}

export async function removeCertificate(shipmentId: number, documentId: number) {
  await db.shipmentDocument.deleteMany({ where: { id: documentId, shipmentId, shipmentLineId: { not: null } } });
}

/** What still stops a shipment being received: batches without a batch number or a certificate. */
export async function batchesMissing(shipmentId: number) {
  const lines = await db.shipmentLine.findMany({
    where: { shipmentId },
    include: { item: true, _count: { select: { certificates: true } } },
    orderBy: { id: "asc" },
  });
  return lines
    .map((l) => ({ id: l.id, product: l.item.name, qty: l.qty, unit: l.item.unit, batchNo: !l.supplierBatchNo, certificate: l._count.certificates === 0 }))
    .filter((l) => l.batchNo || l.certificate);
}

/** Every stock batch, newest first, with its certificate when it came on a shipment. */
export async function allBatches(filter: { itemId?: number; inStock?: boolean } = {}) {
  const lots = await db.lot.findMany({
    where: { itemId: filter.itemId, qtyOnHand: filter.inStock ? { gt: 0 } : undefined },
    include: {
      item: true,
      shipmentLine: { include: { shipment: { include: { supplier: true } } } },
    },
    orderBy: [{ receivedDate: "desc" }, { id: "desc" }],
  });
  const certificates = await db.shipmentDocument.findMany({
    where: { shipmentLineId: { in: lots.flatMap((l) => (l.shipmentLineId ? [l.shipmentLineId] : [])) } },
    select: { id: true, shipmentId: true, shipmentLineId: true, fileName: true },
  });
  return lots.map((l) => ({ ...l, certificate: certificates.find((c) => c.shipmentLineId === l.shipmentLineId) ?? null }));
}
