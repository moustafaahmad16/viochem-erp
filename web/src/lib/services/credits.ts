import Decimal from "decimal.js";
import { invoiceTotals } from "@/lib/costing";
import { db, type Tx } from "@/lib/db";
import { qty as fmtQty } from "@/lib/format";
import { UserError } from "./errors";
import { nextNumber } from "./numbering";

/**
 * Credit notes: money given back on a posted invoice, because goods came back (restock) or the
 * price was reduced. Posting puts returned goods back into the lots they were sold from.
 */

const dec = (v: { toString(): string }) => new Decimal(v.toString());
const ZERO = new Decimal(0);

/** Net, VAT and total of a credit note, worked out exactly like an invoice's. */
export const creditTotals = (note: { lines: { qty: Decimal.Value; unitPrice: Decimal.Value }[]; vatRate: { toString(): string } }) =>
  invoiceTotals(note.lines, note.vatRate.toString());

async function draft(tx: Tx, id: number) {
  const note = await tx.creditNote.findUniqueOrThrow({ where: { id } });
  if (note.status !== "DRAFT") throw new UserError("Only draft credit notes can be changed.");
  return note;
}

/**
 * How much of each line of an invoice is already credited, on posted credit notes plus,
 * when given, one draft note. Keyed by invoice line id.
 */
async function creditedQty(tx: Tx, invoiceId: number, includeNoteId?: number) {
  const lines = await tx.creditNoteLine.findMany({
    where: {
      invoiceLine: { invoiceId },
      creditNote: includeNoteId ? { OR: [{ status: "POSTED" }, { id: includeNoteId }] } : { status: "POSTED" },
    },
  });
  const out = new Map<number, Decimal>();
  for (const l of lines) out.set(l.invoiceLineId, (out.get(l.invoiceLineId) ?? ZERO).plus(dec(l.qty)));
  return out;
}

/** Each line of an invoice with how much of it can still be credited, counting posted notes and this draft. */
export async function creditableLines(invoiceId: number, noteId?: number) {
  const [lines, credited] = await Promise.all([
    db.invoiceLine.findMany({ where: { invoiceId }, include: { item: true }, orderBy: { id: "asc" } }),
    creditedQty(db, invoiceId, noteId),
  ]);
  return lines.map((l) => ({ line: l, credited: credited.get(l.id) ?? ZERO, remaining: dec(l.qty).minus(credited.get(l.id) ?? ZERO) }));
}

export async function createCreditNote(invoiceId: number, date: Date, reason: string) {
  if (!reason.trim()) throw new UserError("Say why the customer is being credited.");
  return db.$transaction(async (tx) => {
    const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    if (inv.status !== "POSTED") throw new UserError(`${inv.number} isn't posted, so it can't be credited.`);
    if (date < inv.date) throw new UserError("A credit note can't be dated before its invoice.");
    return tx.creditNote.create({
      data: { number: await nextNumber(tx, "CRN", date), invoiceId, customerId: inv.customerId, date, reason: reason.trim(), vatRate: inv.vatRate },
    });
  });
}

/** Refuse when the lines of a note, with posted notes, would credit more than was invoiced. */
async function checkQuantities(tx: Tx, noteId: number, invoiceId: number) {
  const credited = await creditedQty(tx, invoiceId, noteId);
  const lines = await tx.invoiceLine.findMany({ where: { invoiceId }, include: { item: true } });
  for (const l of lines) {
    const done = credited.get(l.id) ?? ZERO;
    if (done.gt(dec(l.qty))) {
      const others = await creditedQty(tx, invoiceId);
      const left = Decimal.max(dec(l.qty).minus(others.get(l.id) ?? ZERO), 0);
      throw new UserError(`Only ${fmtQty(left)} ${l.item.unit} of ${l.item.name} can still be credited on this invoice.`);
    }
  }
}

export async function addCreditLine(noteId: number, input: { invoiceLineId: number; qty: Decimal.Value; unitPrice?: Decimal.Value | null; restock: boolean }) {
  const q = new Decimal(input.qty);
  if (q.lte(0)) throw new UserError("Quantity must be more than zero.");
  return db.$transaction(async (tx) => {
    const note = await draft(tx, noteId);
    const il = await tx.invoiceLine.findUnique({ where: { id: input.invoiceLineId } });
    if (!il || il.invoiceId !== note.invoiceId) throw new UserError("That product isn't on this credit note's invoice.");
    const price = input.unitPrice == null || input.unitPrice === "" ? dec(il.unitPrice) : new Decimal(input.unitPrice);
    if (price.lte(0)) throw new UserError("Price must be more than 0.");
    if (price.gt(dec(il.unitPrice))) throw new UserError("The price credited can't be more than the invoice price.");
    const line = await tx.creditNoteLine.create({
      data: { creditNoteId: noteId, invoiceLineId: il.id, qty: q.toString(), unitPrice: price.toString(), restock: input.restock },
    });
    await checkQuantities(tx, noteId, note.invoiceId);
    return line;
  });
}

export async function removeCreditLine(noteId: number, lineId: number) {
  return db.$transaction(async (tx) => {
    await draft(tx, noteId);
    await tx.creditNoteLine.delete({ where: { id: lineId, creditNoteId: noteId } });
  });
}

export async function deleteCreditNote(noteId: number) {
  return db.$transaction(async (tx) => {
    await draft(tx, noteId);
    await tx.creditNote.delete({ where: { id: noteId } });
  });
}

/** Post a draft: returned goods go back into the lots the invoice took them from. */
export async function postCreditNote(noteId: number) {
  return db.$transaction(async (tx) => {
    const note = await draft(tx, noteId);
    const lines = await tx.creditNoteLine.findMany({ where: { creditNoteId: noteId }, orderBy: { id: "asc" } });
    if (!lines.length) throw new UserError("Add at least one product to the credit note.");
    const inv = await tx.invoice.findUniqueOrThrow({ where: { id: note.invoiceId } });
    if (inv.status !== "POSTED") throw new UserError(`${inv.number} isn't posted, so it can't be credited.`);
    await checkQuantities(tx, noteId, note.invoiceId);

    for (const line of lines.filter((l) => l.restock)) {
      const sales = await tx.stockMove.findMany({ where: { invoiceLineId: line.invoiceLineId, kind: "SALE" }, include: { lot: true }, orderBy: { id: "asc" } });
      const earlier = await tx.stockMove.findMany({
        where: { kind: "RETURN", creditLine: { invoiceLineId: line.invoiceLineId, creditNote: { status: "POSTED" } } },
      });
      const returned = new Map<number, Decimal>();
      for (const m of earlier) returned.set(m.lotId, (returned.get(m.lotId) ?? ZERO).plus(dec(m.qty)));
      let remaining = dec(line.qty);
      for (const sale of sales) {
        if (remaining.lte(0)) break;
        const room = dec(sale.qty).neg().minus(returned.get(sale.lotId) ?? ZERO);
        if (room.lte(0)) continue;
        const back = Decimal.min(room, remaining);
        returned.set(sale.lotId, (returned.get(sale.lotId) ?? ZERO).plus(back));
        remaining = remaining.minus(back);
        await tx.lot.update({ where: { id: sale.lotId }, data: { qtyOnHand: { increment: back.toString() } } });
        await tx.stockMove.create({
          data: { lotId: sale.lotId, date: note.date, kind: "RETURN", qty: back.toString(), unitCostEgp: sale.lot.unitCostEgp, creditLineId: line.id, note: note.number },
        });
      }
      if (remaining.gt(0)) throw new UserError("More is being returned than was taken out of stock for this invoice.");
    }
    await tx.creditNote.update({ where: { id: noteId }, data: { status: "POSTED", postedAt: new Date() } });
  });
}

/** Cancel a posted credit note and take returned goods back out of their lots. */
export async function cancelCreditNote(noteId: number) {
  return db.$transaction(async (tx) => {
    const note = await tx.creditNote.findUniqueOrThrow({ where: { id: noteId } });
    if (note.status !== "POSTED") throw new UserError("Only posted credit notes can be cancelled.");
    const moves = await tx.stockMove.findMany({ where: { kind: "RETURN", creditLine: { creditNoteId: noteId } }, include: { lot: true } });
    for (const m of moves) {
      const lot = await tx.lot.findUniqueOrThrow({ where: { id: m.lotId } });
      if (dec(lot.qtyOnHand).lt(dec(m.qty))) {
        throw new UserError(`Lot ${lot.lotNo} no longer has the ${fmtQty(m.qty)} that came back, so this credit note can't be cancelled.`);
      }
      await tx.lot.update({ where: { id: m.lotId }, data: { qtyOnHand: { decrement: m.qty.toString() } } });
    }
    await tx.stockMove.deleteMany({ where: { id: { in: moves.map((m) => m.id) } } });
    await tx.creditNote.update({ where: { id: noteId }, data: { status: "CANCELLED" } });
  });
}
