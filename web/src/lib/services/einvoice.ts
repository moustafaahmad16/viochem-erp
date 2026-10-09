import type { EtaStatus } from "@prisma/client";
import { invoiceTotals } from "@/lib/costing";
import { db } from "@/lib/db";
import { cancelDocument, documentStatus, sign, submit } from "@/lib/eta/client";
import { buildDocument, issuedAt, problems, UNIT_TYPES, withSignature, type Party } from "@/lib/eta/document";
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

/** The ETA document for a posted invoice, and anything that would stop it being accepted. */
export async function prepare(invoiceId: number) {
  const [inv, s] = await Promise.all([
    db.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { customer: true, lines: { include: { item: true }, orderBy: { id: "asc" } } } }),
    etaSettings(),
  ]);
  const c = inv.customer;
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
  const lines = inv.lines.map((l) => ({
    description: l.item.name,
    productName: l.item.name,
    itemType: l.item.etaItemType,
    itemCode: l.item.etaItemCode ?? "",
    unitType: UNIT_TYPES[l.item.unit] ?? "KGM",
    internalCode: l.item.code,
    qty: l.qty.toString(),
    unitPrice: l.unitPrice.toString(),
    vatRate: inv.vatRate.toString(),
  }));
  const total = invoiceTotals(inv.lines, inv.vatRate.toString()).total;
  const document = buildDocument({
    issuer,
    receiver,
    internalId: inv.number,
    dateTimeIssued: issuedAt(inv.date, inv.postedAt),
    activityCode: s.activityCode,
    version: s.documentVersion,
    lines,
  });
  return { invoice: inv, document, problems: problems({ issuer, activityCode: s.activityCode, receiver: { ...receiver, label: c.name }, lines, total }) };
}

const SENDABLE: EtaStatus[] = ["NOT_SENT", "REJECTED", "INVALID"];

/** Sign and send one posted invoice to ETA, and keep what ETA said on the invoice. */
export async function sendInvoice(invoiceId: number) {
  const { invoice, document, problems: missing } = await prepare(invoiceId);
  if (invoice.status !== "POSTED") throw new UserError("Only posted invoices can be sent to the tax authority.");
  if (!SENDABLE.includes(invoice.etaStatus)) throw new UserError("This invoice is already with the tax authority.");
  if (missing.length) throw new UserError(`Fix these first:\n${missing.join("\n")}`);

  const result = await submit([withSignature(document, await sign(document))]);
  const accepted = result.accepted.find((d) => d.internalId === invoice.number) ?? result.accepted[0];
  const data = accepted
    ? { etaStatus: "SUBMITTED" as const, etaUuid: accepted.uuid, etaLongId: accepted.longId, etaSubmissionUuid: result.submissionId, etaError: null, etaSentAt: new Date() }
    : {
        etaStatus: "REJECTED" as const,
        etaError: describeError(result.rejected[0]?.error ?? result.body ?? `HTTP ${result.status}`),
        etaSentAt: new Date(),
      };
  return db.invoice.update({ where: { id: invoiceId }, data });
}

const STATUS: Record<string, EtaStatus> = { Submitted: "SUBMITTED", Valid: "VALID", Invalid: "INVALID", Rejected: "REJECTED", Cancelled: "CANCELLED" };

/** Ask ETA whether a sent invoice passed its checks. */
export async function refreshStatus(invoiceId: number) {
  const inv = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (!inv.etaUuid) throw new UserError("This invoice hasn't been sent to the tax authority.");
  const { status, errors } = await documentStatus(inv.etaUuid);
  const etaStatus = STATUS[status] ?? inv.etaStatus;
  return db.invoice.update({
    where: { id: invoiceId },
    data: { etaStatus, etaError: etaStatus === "INVALID" || etaStatus === "REJECTED" ? describeInvalid(errors) : null },
  });
}

function describeInvalid(results: unknown): string {
  const steps = (results as { validationSteps?: { name?: string; status?: string; error?: unknown }[] } | null)?.validationSteps ?? [];
  const failed = steps.filter((s) => s.status === "Invalid").map((s) => `${s.name}: ${describeError(s.error)}`);
  return failed.join("\n") || "The tax authority marked it invalid.";
}

/** Cancel an invoice's e-invoice at ETA, when it was sent. Needed before the invoice itself is cancelled. */
export async function cancelOnEta(invoiceId: number, reason: string) {
  const inv = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (!inv.etaUuid || !["SUBMITTED", "VALID"].includes(inv.etaStatus)) return;
  await cancelDocument(inv.etaUuid, reason);
  await db.invoice.update({ where: { id: invoiceId }, data: { etaStatus: "CANCELLED" } });
}
