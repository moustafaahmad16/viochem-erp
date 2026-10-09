import Decimal from "decimal.js";
import { db, type Tx } from "@/lib/db";
import { shipmentDateProblem, today } from "@/lib/dates";
import { qty as fmtQty } from "@/lib/format";
import { UserError } from "./errors";
import { nextNumber } from "./numbering";

/**
 * Purchase orders: what VIOCHEM has asked a supplier for, before any goods are sent.
 * An order posts nothing to the ledger and changes nothing owed; the supplier's bill
 * comes from each shipment made from it, as before.
 */

const dec = (v: { toString(): string }) => new Decimal(v.toString());
const ZERO = new Decimal(0);

type OrderForProgress = {
  lines: { id: number; itemId: number; qty: { toString(): string }; unitPrice: { toString(): string }; shipmentLines: { qty: { toString(): string } }[] }[];
};

export type LineProgress = { lineId: number; itemId: number; ordered: Decimal; shipped: Decimal; remaining: Decimal };

/** How much of each line has been put on a shipment, and how much is still to come. */
export function orderProgress(order: OrderForProgress) {
  const lines: LineProgress[] = order.lines.map((l) => {
    const ordered = dec(l.qty);
    const shipped = l.shipmentLines.reduce((s, sl) => s.plus(dec(sl.qty)), ZERO);
    const remaining = Decimal.max(ordered.minus(shipped), 0);
    return { lineId: l.id, itemId: l.itemId, ordered, shipped, remaining };
  });
  const value = order.lines.reduce((s, l) => s.plus(dec(l.qty).times(dec(l.unitPrice))), ZERO);
  const shippedValue = order.lines.reduce((s, l, i) => s.plus(Decimal.min(lines[i].shipped, lines[i].ordered).times(dec(l.unitPrice))), ZERO);
  // Share shipped by value; by quantity when the order has no prices yet.
  const orderedQty = lines.reduce((s, l) => s.plus(l.ordered), ZERO);
  const shippedQty = lines.reduce((s, l) => s.plus(Decimal.min(l.shipped, l.ordered)), ZERO);
  const percentShipped = value.gt(0) ? shippedValue.div(value).times(100) : orderedQty.gt(0) ? shippedQty.div(orderedQty).times(100) : ZERO;
  const done = lines.length > 0 && lines.every((l) => l.remaining.isZero());
  return { lines, byLine: new Map(lines.map((l) => [l.lineId, l])), value, percentShipped, done };
}

const withLines = { lines: { include: { item: true, shipmentLines: true }, orderBy: { id: "asc" as const } }, shipments: true } as const;

async function load(tx: Tx, id: number) {
  const order = await tx.purchaseOrder.findUnique({ where: { id }, include: withLines });
  if (!order) throw new UserError("That purchase order no longer exists.");
  return order;
}

async function openOrder(tx: Tx, id: number) {
  const order = await load(tx, id);
  if (order.status !== "OPEN") throw new UserError("Only open purchase orders can be changed.");
  return order;
}

function checkLine(qty: Decimal.Value, unitPrice: Decimal.Value) {
  if (new Decimal(qty).lte(0)) throw new UserError("Quantity must be more than zero.");
  if (new Decimal(unitPrice).lt(0)) throw new UserError("Price can't be negative.");
}

export async function createOrder(input: { supplierId: number; date: Date; expectedDate: Date | null; currency?: string | null; notes: string | null }) {
  if (input.expectedDate && input.expectedDate < input.date) throw new UserError("The expected date can't be before the order date.");
  return db.$transaction(async (tx) => {
    const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
    if (!supplier) throw new UserError("Choose a supplier.");
    return tx.purchaseOrder.create({
      data: {
        number: await nextNumber(tx, "PO", input.date),
        supplierId: supplier.id,
        date: input.date,
        expectedDate: input.expectedDate,
        currency: (input.currency || supplier.currency).toUpperCase(),
        notes: input.notes,
      },
    });
  });
}

/** Change an open order's details. The supplier and currency are fixed once goods have been shipped. */
export async function updateOrder(id: number, input: { supplierId: number; date: Date; expectedDate: Date | null; currency: string; notes: string | null }) {
  if (input.expectedDate && input.expectedDate < input.date) throw new UserError("The expected date can't be before the order date.");
  return db.$transaction(async (tx) => {
    const order = await openOrder(tx, id);
    const currency = input.currency.toUpperCase();
    if (order.shipments.length && (input.supplierId !== order.supplierId || currency !== order.currency)) {
      throw new UserError("Goods have already been shipped on this order, so its supplier and currency can't change.");
    }
    return tx.purchaseOrder.update({ where: { id }, data: { ...input, currency } });
  });
}

export async function addOrderLine(orderId: number, input: { itemId: number; qty: Decimal.Value; unitPrice: Decimal.Value }) {
  checkLine(input.qty, input.unitPrice);
  return db.$transaction(async (tx) => {
    await openOrder(tx, orderId);
    return tx.purchaseOrderLine.create({ data: { orderId, itemId: input.itemId, qty: input.qty.toString(), unitPrice: input.unitPrice.toString() } });
  });
}

async function unshippedLine(tx: Tx, orderId: number, lineId: number) {
  await openOrder(tx, orderId);
  const line = await tx.purchaseOrderLine.findUnique({ where: { id: lineId }, include: { item: true, _count: { select: { shipmentLines: true } } } });
  if (!line || line.orderId !== orderId) throw new UserError("That line isn't on this order.");
  if (line._count.shipmentLines) throw new UserError(`Some ${line.item.name} has already been shipped, so this line can't change.`);
  return line;
}

export async function updateOrderLine(orderId: number, lineId: number, input: { qty: Decimal.Value; unitPrice: Decimal.Value }) {
  checkLine(input.qty, input.unitPrice);
  return db.$transaction(async (tx) => {
    await unshippedLine(tx, orderId, lineId);
    return tx.purchaseOrderLine.update({ where: { id: lineId }, data: { qty: input.qty.toString(), unitPrice: input.unitPrice.toString() } });
  });
}

export async function removeOrderLine(orderId: number, lineId: number) {
  return db.$transaction(async (tx) => {
    await unshippedLine(tx, orderId, lineId);
    await tx.purchaseOrderLine.delete({ where: { id: lineId } });
  });
}

/**
 * Make a shipment for some or all of what is still to come on an order, following the same rules
 * as a shipment entered by hand. Its lines keep the order's prices and point back to the order line.
 */
export async function shipFromOrder(
  orderId: number,
  input: {
    fxRate: Decimal.Value;
    orderDate?: Date | null;
    etd?: Date | null;
    eta?: Date | null;
    supplierInvoiceNo?: string | null;
    lines: { orderLineId: number; qty: Decimal.Value }[];
  },
) {
  if (new Decimal(input.fxRate).lte(0)) throw new UserError("Exchange rate must be more than zero.");
  const etd = input.etd ?? null;
  const eta = input.eta ?? null;
  const problem = shipmentDateProblem(etd, eta, null);
  if (problem) throw new UserError(problem);

  return db.$transaction(async (tx) => {
    const order = await load(tx, orderId);
    if (order.status !== "OPEN") throw new UserError("Only open purchase orders can be shipped from.");
    const progress = orderProgress(order);

    // Add up the quantities asked for per line, in case a line is named twice.
    const wanted = new Map<number, Decimal>();
    for (const l of input.lines) {
      const q = new Decimal(l.qty);
      if (q.lt(0)) throw new UserError("Quantity can't be negative.");
      if (q.isZero()) continue;
      if (!progress.byLine.has(l.orderLineId)) throw new UserError("That line isn't on this order.");
      wanted.set(l.orderLineId, (wanted.get(l.orderLineId) ?? ZERO).plus(q));
    }
    if (!wanted.size) throw new UserError("Enter how much of at least one product is in this shipment.");

    for (const [lineId, q] of wanted) {
      const p = progress.byLine.get(lineId)!;
      if (q.gt(p.remaining)) {
        const line = order.lines.find((l) => l.id === lineId)!;
        throw new UserError(`Only ${fmtQty(p.remaining)} ${line.item.unit} of ${line.item.name} is left to ship on this order.`);
      }
    }

    const orderDate = input.orderDate ?? today();
    const shipment = await tx.shipment.create({
      data: {
        ref: await nextNumber(tx, "SHP", orderDate),
        supplierId: order.supplierId,
        currency: order.currency,
        fxRate: new Decimal(input.fxRate).toString(),
        orderDate,
        etd,
        eta,
        supplierInvoiceNo: input.supplierInvoiceNo ?? null,
        allocation: "VALUE",
        notes: null,
        purchaseOrderId: order.id,
      },
    });
    for (const line of order.lines) {
      const q = wanted.get(line.id);
      if (!q) continue;
      await tx.shipmentLine.create({ data: { shipmentId: shipment.id, itemId: line.itemId, qty: q.toString(), unitPrice: line.unitPrice, orderLineId: line.id } });
    }

    const nothingLeft = progress.lines.every((p) => p.remaining.minus(wanted.get(p.lineId) ?? ZERO).lte(0));
    if (nothingLeft) await tx.purchaseOrder.update({ where: { id: order.id }, data: { status: "CLOSED" } });
    return shipment;
  });
}

/** Close an order by hand, e.g. when the supplier can't send the rest. */
export async function closeOrder(id: number) {
  return db.$transaction(async (tx) => {
    const order = await load(tx, id);
    if (order.status !== "OPEN") throw new UserError("Only open purchase orders can be closed.");
    await tx.purchaseOrder.update({ where: { id }, data: { status: "CLOSED" } });
  });
}

export async function reopenOrder(id: number) {
  return db.$transaction(async (tx) => {
    const order = await load(tx, id);
    if (order.status === "OPEN") throw new UserError("This purchase order is already open.");
    await tx.purchaseOrder.update({ where: { id }, data: { status: "OPEN" } });
  });
}

export async function cancelOrder(id: number) {
  return db.$transaction(async (tx) => {
    const order = await load(tx, id);
    if (order.status === "CANCELLED") throw new UserError("This purchase order is already cancelled.");
    if (order.shipments.length) throw new UserError("Goods have already been shipped on this order, so it can't be cancelled. Close it instead.");
    await tx.purchaseOrder.update({ where: { id }, data: { status: "CANCELLED" } });
  });
}

export async function deleteOrder(id: number) {
  return db.$transaction(async (tx) => {
    const order = await load(tx, id);
    if (order.status !== "OPEN" || order.shipments.length) throw new UserError("Only open purchase orders with no shipments can be deleted.");
    await tx.purchaseOrder.delete({ where: { id } });
  });
}

/**
 * Quantity of each product still coming in: what is left to ship on open purchase orders,
 * plus what is on shipments that haven't been received yet.
 */
export async function onOrder(): Promise<Map<number, Decimal>> {
  const [orders, shipmentLines] = await Promise.all([
    db.purchaseOrder.findMany({ where: { status: "OPEN" }, include: { lines: { include: { shipmentLines: true } } } }),
    db.shipmentLine.findMany({ where: { shipment: { status: { not: "RECEIVED" } } }, select: { itemId: true, qty: true } }),
  ]);
  const result = new Map<number, Decimal>();
  const add = (itemId: number, q: Decimal) => {
    if (q.gt(0)) result.set(itemId, (result.get(itemId) ?? ZERO).plus(q));
  };
  for (const order of orders) for (const p of orderProgress(order).lines) add(p.itemId, p.remaining);
  for (const l of shipmentLines) add(l.itemId, dec(l.qty));
  return result;
}
