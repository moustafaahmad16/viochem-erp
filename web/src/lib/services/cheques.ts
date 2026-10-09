import Decimal from "decimal.js";
import type { ChequeStatus } from "@prisma/client";
import { addDays, today } from "@/lib/dates";
import { db, type Tx } from "@/lib/db";
import { activeAccount } from "./banking";
import { UserError } from "./errors";
import { nextNumber } from "./numbering";

/**
 * Post-dated cheques. A received cheque counts as paid by the customer on the day it is received
 * and waits in 1220 until it clears into the bank; if it bounces the customer owes it again.
 * An issued cheque counts as paid to the supplier when written and waits in 2120 until cashed.
 * The general ledger, the customer and supplier accounts and the bank ledgers all read these
 * records directly, so changing a cheque's state is all there is to do.
 */

export const OPEN: ChequeStatus[] = ["PENDING", "DEPOSITED"];

type Common = { chequeNo: string; bank: string | null; date: Date; dueDate: Date; amount: string; notes: string | null };

function check(c: Common) {
  if (!c.chequeNo.trim()) throw new UserError("Cheque number is required.");
  if (new Decimal(c.amount).lte(0)) throw new UserError("Amount must be more than 0.");
  if (c.dueDate < c.date) throw new UserError("The date on the cheque can't be before the day it was received or written.");
}

/** A cheque from a customer, numbered CHQ-YYYY-0001. */
export async function receiveCheque(c: Common & { customerId: number; invoiceId: number | null }) {
  check(c);
  const customer = await db.customer.findUnique({ where: { id: c.customerId } });
  if (!customer) throw new UserError("Choose a customer.");
  if (c.invoiceId) {
    const inv = await db.invoice.findUnique({ where: { id: c.invoiceId } });
    if (!inv || inv.customerId !== c.customerId) throw new UserError("That invoice is for a different customer.");
    if (inv.status !== "POSTED") throw new UserError(`${inv.number} isn't posted, so it can't be paid.`);
  }
  return db.$transaction(async (tx) =>
    tx.cheque.create({ data: { ...c, chequeNo: c.chequeNo.trim(), direction: "RECEIVED", number: await nextNumber(tx, "CHQ", c.date) } }),
  );
}

/** A cheque written to a supplier, in EGP, drawn on one of our EGP bank accounts. */
export async function issueCheque(c: Common & { supplierId: number; shipmentId: number | null; accountId: number | null }) {
  check(c);
  const supplier = await db.supplier.findUnique({ where: { id: c.supplierId } });
  if (!supplier) throw new UserError("Choose a supplier.");
  if (c.shipmentId) {
    const sh = await db.shipment.findUnique({ where: { id: c.shipmentId } });
    if (!sh || sh.supplierId !== c.supplierId) throw new UserError("That shipment is from a different supplier.");
    if (sh.currency !== "EGP") throw new UserError(`${sh.ref} is billed in ${sh.currency}. Pay it by bank transfer instead.`);
  }
  if (!c.accountId) throw new UserError("Choose the bank account the cheque is drawn on.");
  return db.$transaction(async (tx) => {
    const account = (await activeAccount(tx, c.accountId, { egpOnly: true }))!;
    const bank = c.bank ?? account.name;
    return tx.cheque.create({ data: { ...c, bank, chequeNo: c.chequeNo.trim(), direction: "ISSUED", number: await nextNumber(tx, "CHQ", c.date) } });
  });
}

async function find(tx: Tx, id: number) {
  const c = await tx.cheque.findUnique({ where: { id } });
  if (!c) throw new UserError("That cheque no longer exists.");
  return c;
}

function notBefore(date: Date, earliest: Date) {
  if (date < earliest) throw new UserError("That date is before the cheque was received or written.");
}

/** A received cheque handed to the bank. Nothing moves in the books until it clears. */
export async function depositCheque(id: number, accountId: number | null, date: Date) {
  return db.$transaction(async (tx) => {
    const c = await find(tx, id);
    if (c.direction !== "RECEIVED") throw new UserError("Only cheques from customers are deposited.");
    if (c.status !== "PENDING") throw new UserError("Only a cheque still in hand can be deposited.");
    if (!accountId) throw new UserError("Choose the bank account it was deposited into.");
    await activeAccount(tx, accountId, { egpOnly: true });
    notBefore(date, c.date);
    return tx.cheque.update({ where: { id }, data: { status: "DEPOSITED", accountId, depositedOn: date } });
  });
}

/** The money moved: into our bank for a received cheque, out of it for an issued one. */
export async function clearCheque(id: number, date: Date) {
  return db.$transaction(async (tx) => {
    const c = await find(tx, id);
    if (c.direction === "RECEIVED" && c.status !== "DEPOSITED") throw new UserError("Deposit the cheque in a bank account first.");
    if (c.direction === "ISSUED" && c.status !== "PENDING") throw new UserError("Only a cheque not yet cashed can be marked as cashed.");
    if (!c.accountId) throw new UserError("Choose the bank account the cheque is drawn on.");
    notBefore(date, c.date);
    if (c.depositedOn && date < c.depositedOn) throw new UserError("A cheque can't clear before it was deposited.");
    return tx.cheque.update({ where: { id }, data: { status: "CLEARED", clearedOn: date } });
  });
}

/** Refused by the bank, or handed back: the customer owes it again, or we owe the supplier again. */
export async function bounceCheque(id: number, date: Date) {
  return db.$transaction(async (tx) => {
    const c = await find(tx, id);
    if (!OPEN.includes(c.status)) throw new UserError("Only a cheque that hasn't cleared can bounce.");
    notBefore(date, c.date);
    return tx.cheque.update({ where: { id }, data: { status: "BOUNCED", bouncedOn: date } });
  });
}

/** Undo a mistake: back to pending, as when it was first recorded. */
export async function reopenCheque(id: number) {
  return db.$transaction(async (tx) => {
    const c = await find(tx, id);
    return tx.cheque.update({
      where: { id },
      data: { status: "PENDING", depositedOn: null, clearedOn: null, bouncedOn: null, ...(c.direction === "RECEIVED" ? { accountId: null } : {}) },
    });
  });
}

export async function deleteCheque(id: number) {
  return db.$transaction(async (tx) => {
    const c = await find(tx, id);
    if (c.status !== "PENDING") throw new UserError("Only a pending cheque can be deleted. Reopen it first.");
    return tx.cheque.delete({ where: { id } });
  });
}

/** Cheques not yet cleared that are due within `days` days (or already past due), soonest first. */
export async function chequesDue(days: number) {
  const until = addDays(today(), days);
  const where = { status: { in: OPEN }, dueDate: { lte: until } };
  const [received, issued] = await Promise.all([
    db.cheque.findMany({ where: { ...where, direction: "RECEIVED" }, include: { customer: true }, orderBy: [{ dueDate: "asc" }, { id: "asc" }] }),
    db.cheque.findMany({ where: { ...where, direction: "ISSUED" }, include: { supplier: true }, orderBy: [{ dueDate: "asc" }, { id: "asc" }] }),
  ]);
  return { received, issued };
}
