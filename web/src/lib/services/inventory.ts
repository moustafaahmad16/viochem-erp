import Decimal from "decimal.js";
import type { InvoiceKind } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { landedUnitCosts, pickLots } from "@/lib/costing";
import { addDays, formatDate, today } from "@/lib/dates";
import { batchName, isExpired } from "./batches";
import { UserError } from "./errors";
import { draftNumber, isDraftNumber, takeInvoiceNumber } from "./invoice-numbers";
import { nextNumber } from "./numbering";

const dec = (v: { toString(): string }) => new Decimal(v.toString());

async function lineCosts(tx: Tx, shipmentId: number) {
  const shipment = await tx.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
    include: { lines: true, charges: true },
  });
  const costs = landedUnitCosts(
    shipment.lines.map((l) => ({ id: l.id, qty: dec(l.qty), unitPrice: dec(l.unitPrice) })),
    dec(shipment.fxRate),
    shipment.charges.map((c) => dec(c.amountEgp)),
    shipment.allocation,
  );
  return { shipment, costs };
}

/** Receive a shipment into stock: one new lot per line, costed with freight, duty and other charges. */
export async function receiveShipment(shipmentId: number, arrivalDate: Date) {
  return db.$transaction(async (tx) => {
    const { shipment, costs } = await lineCosts(tx, shipmentId);
    if (shipment.status === "RECEIVED") throw new UserError("This shipment has already been received.");
    if (!shipment.lines.length) throw new UserError("Add the products in this shipment before receiving it.");
    if (shipment.etd && arrivalDate < shipment.etd) throw new UserError("Arrival can't be before the departure date.");

    for (const line of shipment.lines) {
      const unitCost = costs.get(line.id)!;
      const lot = await tx.lot.create({
        data: {
          lotNo: await nextNumber(tx, "LOT", arrivalDate),
          itemId: line.itemId,
          shipmentLineId: line.id,
          receivedDate: arrivalDate,
          qtyReceived: line.qty,
          qtyOnHand: line.qty,
          unitCostEgp: unitCost.toFixed(4),
          expiryDate: line.expiryDate,
          manufactureDate: line.manufactureDate,
          supplierBatchNo: line.supplierBatchNo,
        },
      });
      await tx.stockMove.create({
        data: { lotId: lot.id, date: arrivalDate, kind: "RECEIPT", qty: line.qty, unitCostEgp: unitCost.toFixed(4), note: shipment.ref },
      });
    }
    await tx.shipment.update({ where: { id: shipmentId }, data: { status: "RECEIVED", arrivalDate } });
  });
}

/**
 * Re-cost a received shipment after its charges change (a customs bill often arrives late).
 * Because each lot keeps its own cost, this updates the lots and every sale already made from them,
 * so margins stay right without any manual correction.
 */
export async function recostShipment(tx: Tx, shipmentId: number) {
  const { shipment, costs } = await lineCosts(tx, shipmentId);
  if (shipment.status !== "RECEIVED") return;
  for (const line of shipment.lines) {
    const unitCost = costs.get(line.id)!.toFixed(4);
    const lot = await tx.lot.update({ where: { shipmentLineId: line.id }, data: { unitCostEgp: unitCost } });
    await tx.stockMove.updateMany({ where: { lotId: lot.id }, data: { unitCostEgp: unitCost } });
  }
}

/** Stock already on the shelf before VIOCHEM started using this app. */
export async function addOpeningStock(input: {
  itemId: number;
  qty: Decimal.Value;
  unitCostEgp: Decimal.Value;
  date: Date;
  expiryDate: Date | null;
  manufactureDate?: Date | null;
  supplierBatchNo: string | null;
}) {
  if (new Decimal(input.qty).lte(0)) throw new UserError("Quantity must be more than zero.");
  if (new Decimal(input.unitCostEgp).lt(0)) throw new UserError("Cost can't be negative.");
  return db.$transaction(async (tx) => {
    const lot = await tx.lot.create({
      data: {
        lotNo: await nextNumber(tx, "LOT", input.date),
        itemId: input.itemId,
        receivedDate: input.date,
        qtyReceived: input.qty.toString(),
        qtyOnHand: input.qty.toString(),
        unitCostEgp: input.unitCostEgp.toString(),
        expiryDate: input.expiryDate,
        manufactureDate: input.manufactureDate ?? null,
        supplierBatchNo: input.supplierBatchNo,
      },
    });
    await tx.stockMove.create({
      data: { lotId: lot.id, date: input.date, kind: "OPENING", qty: input.qty.toString(), unitCostEgp: input.unitCostEgp.toString(), note: "Opening stock" },
    });
    return lot;
  });
}

/** Correct a lot's quantity after a stock count. */
export async function adjustLot(lotId: number, countedQty: Decimal.Value, note: string) {
  const counted = new Decimal(countedQty);
  if (counted.lt(0)) throw new UserError("Counted quantity can't be negative.");
  if (!note.trim()) throw new UserError("Say why the quantity changed.");
  return db.$transaction(async (tx) => {
    const lot = await tx.lot.findUniqueOrThrow({ where: { id: lotId } });
    const diff = counted.minus(dec(lot.qtyOnHand));
    if (diff.isZero()) return;
    await tx.lot.update({ where: { id: lotId }, data: { qtyOnHand: counted.toString() } });
    await tx.stockMove.create({
      data: { lotId, date: today(), kind: "ADJUSTMENT", qty: diff.toString(), unitCostEgp: lot.unitCostEgp, note },
    });
  });
}

/**
 * Post a draft invoice: take the stock out of batches, earliest expiry first, and lock in the cost of
 * what was sold. Batches already expired on the invoice date are never sold.
 */
export async function postInvoice(invoiceId: number) {
  return db.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { customer: true, lines: { include: { item: true } } },
    });
    if (invoice.status !== "DRAFT") throw new UserError("Only draft invoices can be posted.");
    if (!invoice.lines.length) throw new UserError("Add at least one product to the invoice.");
    // A draft gets its real number now, so deleted drafts leave no gaps. A typed number is kept.
    let number = invoice.number;
    if (isDraftNumber(number)) {
      do number = await takeInvoiceNumber(tx, invoice.kind);
      while (await tx.invoice.findUnique({ where: { number } }));
    }

    for (const line of invoice.lines) {
      const lots = await tx.lot.findMany({
        where: line.lotId ? { id: line.lotId } : { itemId: line.itemId, qtyOnHand: { gt: 0 } },
      });
      const chosen = line.lotId ? lots[0] : null;
      if (chosen && isExpired(chosen, invoice.date)) {
        throw new UserError(`Batch ${batchName(chosen)} of ${line.item.name} expired on ${formatDate(chosen.expiryDate)}, so it can't be sold.`);
      }
      const sellable = lots.filter((l) => l.receivedDate <= invoice.date && !isExpired(l, invoice.date));
      const picks = pickLots(sellable, dec(line.qty));
      if (!picks) {
        const available = sellable.reduce((s, l) => s.plus(dec(l.qtyOnHand)), new Decimal(0));
        const expired = lots.filter((l) => isExpired(l, invoice.date)).reduce((s, l) => s.plus(dec(l.qtyOnHand)), new Decimal(0));
        throw new UserError(
          `Not enough ${line.item.name} in stock${line.lotId ? " in the chosen batch" : ""} on that date: ${available.toString()} ${line.item.unit} available.` +
            (expired.gt(0) ? ` Another ${expired.toString()} ${line.item.unit} has expired and can't be sold.` : ""),
        );
      }
      for (const pick of picks) {
        const lot = lots.find((l) => l.id === pick.lotId)!;
        await tx.lot.update({ where: { id: lot.id }, data: { qtyOnHand: { decrement: pick.qty.toString() } } });
        await tx.stockMove.create({
          data: {
            lotId: lot.id,
            date: invoice.date,
            kind: "SALE",
            qty: pick.qty.neg().toString(),
            unitCostEgp: lot.unitCostEgp,
            invoiceLineId: line.id,
            note: number,
          },
        });
      }
    }
    return tx.invoice.update({ where: { id: invoiceId }, data: { number, status: "POSTED", postedAt: new Date(), dueDate: addDays(invoice.date, invoice.customer.paymentTermsDays) } });
  });
}

/** Cancel a posted invoice and put its stock back into the same lots. */
export async function cancelInvoice(invoiceId: number) {
  return db.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { lines: { include: { moves: true } } } });
    if (invoice.status !== "POSTED") throw new UserError("Only posted invoices can be cancelled.");
    if (await tx.creditNote.count({ where: { invoiceId, status: "POSTED" } })) throw new UserError("Cancel its credit notes first.");
    for (const move of invoice.lines.flatMap((l) => l.moves)) {
      await tx.lot.update({ where: { id: move.lotId }, data: { qtyOnHand: { increment: dec(move.qty).neg().toString() } } });
    }
    await tx.stockMove.deleteMany({ where: { invoiceLineId: { in: invoice.lines.map((l) => l.id) } } });
    await tx.invoice.update({ where: { id: invoiceId }, data: { status: "CANCELLED" } });
  });
}

/**
 * A draft invoice. Unless a number is typed in, it gets the next number of its kind when posted.
 * Non-taxed invoices carry no VAT or withholding tax.
 */
export async function createInvoice(
  customerId: number,
  date: Date,
  extra: { number?: string | null; deliveryNoteNo?: string | null; whtRate?: number; kind?: InvoiceKind } = {},
) {
  const kind = extra.kind ?? "TAXED";
  const typed = extra.number?.trim() || null;
  return db.$transaction(async (tx) => {
    if (typed) await uniqueInvoiceNumber(tx, typed);
    const taxes = kind === "NON_TAXED" ? { vatRate: 0, whtRate: 0 } : { whtRate: extra.whtRate ?? 0 };
    const invoice = await tx.invoice.create({ data: { number: typed ?? `${draftNumber(0)}-${crypto.randomUUID()}`, kind, customerId, date, deliveryNoteNo: extra.deliveryNoteNo?.trim() || null, ...taxes } });
    return typed ? invoice : tx.invoice.update({ where: { id: invoice.id }, data: { number: draftNumber(invoice.id) } });
  });
}

/** Invoice numbers are unique, typed in or not. */
export async function uniqueInvoiceNumber(tx: Tx, number: string, except?: number) {
  if (isDraftNumber(number) && number !== (except ? draftNumber(except) : "")) throw new UserError("Invoice numbers can't start with DRAFT-. Leave it empty to number the invoice when it is posted.");
  const taken = await tx.invoice.findUnique({ where: { number } });
  if (taken && taken.id !== except) throw new UserError(`Invoice number ${number} is already used.`);
}

export async function createShipment(data: {
  supplierId: number;
  currency: string;
  fxRate: string;
  orderDate: Date;
  etd: Date | null;
  eta: Date | null;
  supplierInvoiceNo: string | null;
  acidNumber?: string | null;
  allocation: "VALUE" | "QUANTITY";
  notes: string | null;
}) {
  if (new Decimal(data.fxRate).lte(0)) throw new UserError("Exchange rate must be more than zero.");
  return db.$transaction(async (tx) =>
    tx.shipment.create({ data: { ...data, ref: await nextNumber(tx, "SHP", data.orderDate) } }),
  );
}
