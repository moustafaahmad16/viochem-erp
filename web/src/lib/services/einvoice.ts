import type { EtaStatus } from "@prisma/client";
import { invoiceTotals } from "@/lib/costing";
import { db } from "@/lib/db";
import { cancelDocument, documentStatus, sign, submit } from "@/lib/eta/client";
import { buildDocument, issuedAt, problems, UNIT_TYPES, withSignature, type EtaDocument, type Party } from "@/lib/eta/document";
import { UserError } from "./errors";

export const etaSettings = () => db.etaSettings.upsert({ where: { id: 1 }, create: {}, update: {} });

/** ETA's error object, in lines a person can read. */
export function describeError(error: unknown): string {
  if (!error || typeof error !== "object") return String(error ?? "Unknown error");
  const e = error as { message?: string; error?: string; details?: { message?: string; propertyPath?: string; target?: string }[] };
  const head = e.message ?? e.error ?? "";
  const details = (e.details ?? []).map((d) => `${d.propertyPath ?? d.target ?? ""}: ${d.message ?? ""}`.replace(/^: /, ""));
  return [head, ...details].filter(Boolean).join("\n") || JSON.stringify(error);
}

type EtaCustomer = { name: string; etaType: string | null; taxId: string | null; country: string | null; governate: string | null; city: string | null; street: string | null; buildingNo: string | null };
type EtaSourceLine = { qty: { toString(): string }; unitPrice: { toString(): string }; item: { name: string; etaItemType: string; etaItemCode: string | null; unit: string; code: string } };

/** An ETA document for an invoice or credit note, and anything that would stop it being accepted. */
async function buildFor(d: {
  customer: EtaCustomer;
  number: string;
  date: Date;
  postedAt: Date | null;
  vatRate: { toString(): string };
  lines: EtaSourceLine[];
  documentType?: "I" | "C";
  references?: string[];
}) {
  const s = await etaSettings();
  const c = d.customer;
  const issuer: Party = { type: "B", id: s.taxId, name: s.name, country: "EG", governate: s.governate, city: s.city, street: s.street, buildingNo: s.buildingNo, postalCode: s.postalCode, branchId: s.branchId };
  const receiver: Party = {
    type: c.etaType === "P" || c.etaType === "F" ? c.etaType : "B",
    id: c.taxId ?? "",
    name: c.name,
    country: c.country || "EG",
    governate: c.governate ?? "",
    city: c.city ?? "",
    street: c.street ?? "",
    buildingNo: c.buildingNo ?? "",
  };
  const lines = d.lines.map((l) => ({
    description: l.item.name,
    productName: l.item.name,
    itemType: l.item.etaItemType,
    itemCode: l.item.etaItemCode ?? "",
    unitType: UNIT_TYPES[l.item.unit] ?? "KGM",
    internalCode: l.item.code,
    qty: l.qty.toString(),
    unitPrice: l.unitPrice.toString(),
    vatRate: d.vatRate.toString(),
  }));
  const total = invoiceTotals(lines, d.vatRate.toString()).total;
  const document = buildDocument({
    issuer,
    receiver,
    internalId: d.number,
    dateTimeIssued: issuedAt(d.date, d.postedAt),
    activityCode: s.activityCode,
    version: s.documentVersion,
    documentType: d.documentType,
    references: d.references,
    lines,
  });
  return { document, problems: problems({ issuer, activityCode: s.activityCode, receiver: { ...receiver, label: c.name }, lines, total }) };
}

/** The ETA document for a posted invoice, and anything that would stop it being accepted. */
export async function prepare(invoiceId: number) {
  const inv = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { customer: true, lines: { include: { item: true }, orderBy: { id: "asc" } } } });
  return { invoice: inv, ...(await buildFor(inv)) };
}

/** The ETA credit note for a posted credit note, pointing at its invoice's e-invoice. */
export async function prepareCreditNote(creditNoteId: number) {
  const cn = await db.creditNote.findUniqueOrThrow({
    where: { id: creditNoteId },
    include: { customer: true, invoice: true, lines: { include: { invoiceLine: { include: { item: true } } }, orderBy: { id: "asc" } } },
  });
  const built = await buildFor({
    ...cn,
    lines: cn.lines.map((l) => ({ qty: l.qty, unitPrice: l.unitPrice, item: l.invoiceLine.item })),
    documentType: "C",
    references: cn.invoice.etaUuid ? [cn.invoice.etaUuid] : [],
  });
  const missing = cn.invoice.etaUuid ? built.problems : [`Send ${cn.invoice.number} to the tax authority first.`, ...built.problems];
  return { creditNote: cn, document: built.document, problems: missing };
}

const SENDABLE: EtaStatus[] = ["NOT_SENT", "REJECTED", "INVALID"];

/** Sign and send one document; what to keep on the invoice or credit note afterwards. */
async function sendDocument(document: EtaDocument, internalId: string) {
  const result = await submit([withSignature(document, await sign(document))]);
  const accepted = result.accepted.find((d) => d.internalId === internalId) ?? result.accepted[0];
  return accepted
    ? { etaStatus: "SUBMITTED" as const, etaUuid: accepted.uuid, etaLongId: accepted.longId, etaSubmissionUuid: result.submissionId, etaError: null, etaSentAt: new Date() }
    : {
        etaStatus: "REJECTED" as const,
        etaError: describeError(result.rejected[0]?.error ?? result.body ?? `HTTP ${result.status}`),
        etaSentAt: new Date(),
      };
}

/** Sign and send one posted invoice to ETA, and keep what ETA said on the invoice. */
export async function sendInvoice(invoiceId: number) {
  const { invoice, document, problems: missing } = await prepare(invoiceId);
  if (invoice.status !== "POSTED") throw new UserError("Only posted invoices can be sent to the tax authority.");
  if (!SENDABLE.includes(invoice.etaStatus)) throw new UserError("This invoice is already with the tax authority.");
  if (missing.length) throw new UserError(`Fix these first:\n${missing.join("\n")}`);
  return db.invoice.update({ where: { id: invoiceId }, data: await sendDocument(document, invoice.number) });
}

/** Sign and send one posted credit note to ETA, referring to its invoice's e-invoice. */
export async function sendCreditNote(creditNoteId: number) {
  const { creditNote: cn, document, problems: missing } = await prepareCreditNote(creditNoteId);
  if (cn.status !== "POSTED") throw new UserError("Only posted credit notes can be sent to the tax authority.");
  if (!SENDABLE.includes(cn.etaStatus)) throw new UserError("This credit note is already with the tax authority.");
  if (!cn.invoice.etaUuid) throw new UserError(`Send ${cn.invoice.number} to the tax authority first.`);
  if (missing.length) throw new UserError(`Fix these first:\n${missing.join("\n")}`);
  return db.creditNote.update({ where: { id: creditNoteId }, data: await sendDocument(document, cn.number) });
}

const STATUS: Record<string, EtaStatus> = { Submitted: "SUBMITTED", Valid: "VALID", Invalid: "INVALID", Rejected: "REJECTED", Cancelled: "CANCELLED" };

/** What ETA now says about a sent document. */
async function statusOf(uuid: string, current: EtaStatus) {
  const { status, errors } = await documentStatus(uuid);
  const etaStatus = STATUS[status] ?? current;
  return { etaStatus, etaError: etaStatus === "INVALID" || etaStatus === "REJECTED" ? describeInvalid(errors) : null };
}

/** Ask ETA whether a sent invoice passed its checks. */
export async function refreshStatus(invoiceId: number) {
  const inv = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (!inv.etaUuid) throw new UserError("This invoice hasn't been sent to the tax authority.");
  return db.invoice.update({ where: { id: invoiceId }, data: await statusOf(inv.etaUuid, inv.etaStatus) });
}

/** Ask ETA whether a sent credit note passed its checks. */
export async function refreshCreditNoteStatus(creditNoteId: number) {
  const cn = await db.creditNote.findUniqueOrThrow({ where: { id: creditNoteId } });
  if (!cn.etaUuid) throw new UserError("This credit note hasn't been sent to the tax authority.");
  return db.creditNote.update({ where: { id: creditNoteId }, data: await statusOf(cn.etaUuid, cn.etaStatus) });
}

function describeInvalid(results: unknown): string {
  const steps = (results as { validationSteps?: { name?: string; status?: string; error?: unknown }[] } | null)?.validationSteps ?? [];
  const failed = steps.filter((s) => s.status === "Invalid").map((s) => `${s.name}: ${describeError(s.error)}`);
  return failed.join("\n") || "The tax authority marked it invalid.";
}

const cancellable = (d: { etaUuid: string | null; etaStatus: EtaStatus }): d is { etaUuid: string; etaStatus: EtaStatus } =>
  !!d.etaUuid && ["SUBMITTED", "VALID"].includes(d.etaStatus);

/** Cancel an invoice's e-invoice at ETA, when it was sent. Needed before the invoice itself is cancelled. */
export async function cancelOnEta(invoiceId: number, reason: string) {
  const inv = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (!cancellable(inv)) return;
  await cancelDocument(inv.etaUuid, reason);
  await db.invoice.update({ where: { id: invoiceId }, data: { etaStatus: "CANCELLED" } });
}

/** Cancel a credit note's e-document at ETA, when it was sent. Needed before the credit note itself is cancelled. */
export async function cancelCreditNoteOnEta(creditNoteId: number, reason: string) {
  const cn = await db.creditNote.findUniqueOrThrow({ where: { id: creditNoteId } });
  if (!cancellable(cn)) return;
  await cancelDocument(cn.etaUuid, reason);
  await db.creditNote.update({ where: { id: creditNoteId }, data: { etaStatus: "CANCELLED" } });
}
