import type { InvoiceKind } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { UserError } from "./errors";

/**
 * Invoice numbers. A draft holds a placeholder (DRAFT-12) until it is posted, so deleted drafts
 * leave no gaps. Taxed invoices are numbered 1, 2, 3… from a start number an admin sets once; it
 * locks when the first taxed invoice is posted. Non-taxed invoices are numbered NT-0, NT-1…
 * A number typed in by hand is kept as it is.
 */

const TAXED = "TAXED";
const TAXED_START = "TAXED-START";
const NT = "NT";
const DRAFT = "DRAFT-";

export const isDraftNumber = (number: string) => number.startsWith(DRAFT);
export const draftNumber = (id: number) => `${DRAFT}${id}`;

/** The number the next posted invoice of a kind will get. */
export async function invoiceNumbering(tx: Tx = db) {
  const [taxed, start, nt] = await Promise.all([TAXED, TAXED_START, NT].map((key) => tx.counter.findUnique({ where: { key } })));
  return {
    taxedStart: start?.value ?? 1,
    nextTaxed: taxed ? taxed.value + 1 : (start?.value ?? 1),
    // Locked once a taxed invoice has taken a number.
    locked: !!taxed,
    nextNonTaxed: `NT-${nt ? nt.value + 1 : 0}`,
  };
}

export async function setTaxedStart(start: number) {
  if (!Number.isInteger(start) || start < 1) throw new UserError("The first taxed invoice number must be a whole number, 1 or more.");
  await db.$transaction(async (tx) => {
    if ((await invoiceNumbering(tx)).locked) throw new UserError("Taxed invoices have already been numbered, so the start number can't change.");
    await tx.counter.upsert({ where: { key: TAXED_START }, create: { key: TAXED_START, value: start }, update: { value: start } });
  });
}

/** Take the next number for a kind of invoice. Called when the invoice is posted. */
export async function takeInvoiceNumber(tx: Tx, kind: InvoiceKind) {
  if (kind === "NON_TAXED") {
    const existing = await tx.counter.findUnique({ where: { key: NT } });
    const c = existing ? await tx.counter.update({ where: { key: NT }, data: { value: { increment: 1 } } }) : await tx.counter.create({ data: { key: NT, value: 0 } });
    return `NT-${c.value}`;
  }
  const existing = await tx.counter.findUnique({ where: { key: TAXED } });
  if (existing) return String((await tx.counter.update({ where: { key: TAXED }, data: { value: { increment: 1 } } })).value);
  const start = await tx.counter.findUnique({ where: { key: TAXED_START } });
  return String((await tx.counter.create({ data: { key: TAXED, value: start?.value ?? 1 } })).value);
}
