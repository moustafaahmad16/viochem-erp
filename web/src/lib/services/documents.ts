import { db } from "@/lib/db";
import { UserError } from "@/lib/services/errors";

/** The standard import documents. The migration adds them; this keeps them there if they were removed. */
export const BUILT_IN_TYPES = ["Proforma Invoice", "Commercial Invoice", "Certificate of Origin (COO)", "Packing List", "Bill of Lading"];

export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

/** Every document type, the built-in ones first in their usual order, then people's own by name. */
export async function documentTypes() {
  let types = await db.documentType.findMany({ select: { id: true, name: true, builtIn: true } });
  const missing = BUILT_IN_TYPES.filter((name) => !types.some((t) => t.name === name && t.builtIn));
  if (missing.length) {
    // One someone already added by hand becomes the built-in one, keeping its files.
    await db.documentType.updateMany({ where: { name: { in: missing } }, data: { builtIn: true } });
    // SQLite can't skip duplicates, so a second user adding them at the same moment is simply ignored.
    const added = missing.filter((name) => !types.some((t) => t.name === name));
    await db.documentType.createMany({ data: added.map((name) => ({ name, builtIn: true })) }).catch(() => undefined);
    types = await db.documentType.findMany({ select: { id: true, name: true, builtIn: true } });
  }
  const rank = (t: { name: string; builtIn: boolean }) => (t.builtIn ? BUILT_IN_TYPES.indexOf(t.name) : BUILT_IN_TYPES.length);
  return types.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** The type with this name, ignoring case and extra spaces, or a new one. */
export async function documentType(name: string) {
  const clean = name.replace(/\s+/g, " ").trim();
  if (!clean) throw new UserError("Type a name for the new document type.");
  if (clean.length > 60) throw new UserError("Keep the document type name under 60 characters.");
  const existing = (await documentTypes()).find((t) => t.name.toLowerCase() === clean.toLowerCase());
  return existing ?? db.documentType.create({ data: { name: clean }, select: { id: true, name: true, builtIn: true } });
}

export async function addShipmentDocument(shipmentId: number, typeId: number, file: { name: string; type: string; bytes: Uint8Array }) {
  if (file.bytes.length === 0) throw new UserError("Choose a file to upload.");
  if (file.bytes.length > MAX_DOCUMENT_BYTES) throw new UserError("The file is too big. The most is 15 MB.");
  if (!(await db.documentType.findUnique({ where: { id: typeId } }))) throw new UserError("Choose a document type.");
  return db.shipmentDocument.create({
    data: {
      shipmentId,
      typeId,
      fileName: file.name.slice(0, 200) || "document",
      mimeType: file.type || "application/octet-stream",
      size: file.bytes.length,
      content: Buffer.from(file.bytes),
    },
    select: { id: true },
  });
}

/** A shipment's documents, without their contents. */
export function shipmentDocuments(shipmentId: number) {
  return db.shipmentDocument.findMany({
    where: { shipmentId },
    select: { id: true, typeId: true, fileName: true, mimeType: true, size: true, uploadedAt: true },
    orderBy: { uploadedAt: "asc" },
  });
}

/** Removes a document. A custom type left with no documents anywhere goes too, so typos don't linger in the list. */
export async function removeShipmentDocument(shipmentId: number, id: number) {
  await db.$transaction(async (tx) => {
    const doc = await tx.shipmentDocument.delete({ where: { id, shipmentId }, include: { type: true } });
    if (!doc.type.builtIn && (await tx.shipmentDocument.count({ where: { typeId: doc.typeId } })) === 0) {
      await tx.documentType.delete({ where: { id: doc.typeId } });
    }
  });
}
