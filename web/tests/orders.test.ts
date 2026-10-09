import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { parseInputDate } from "@/lib/dates";
import { receiveShipment } from "@/lib/services/inventory";
import {
  addOrderLine,
  cancelOrder,
  closeOrder,
  createOrder,
  deleteOrder,
  onOrder,
  orderProgress,
  removeOrderLine,
  reopenOrder,
  shipFromOrder,
  updateOrderLine,
} from "@/lib/services/orders";

// Dates in 2034 keep these document numbers apart from the other test files.
const d = (s: string) => parseInputDate(s)!;
const n = (v: { toString(): string } | undefined) => Number(v?.toString() ?? 0);

let supplier: number, itemA: number, itemB: number;

beforeAll(async () => {
  supplier = (await db.supplier.create({ data: { name: "Orders Supplier", currency: "EUR" } })).id;
  itemA = (await db.item.create({ data: { code: "ORD-A", name: "Orders Linalool" } })).id;
  itemB = (await db.item.create({ data: { code: "ORD-B", name: "Orders Geraniol", unit: "L" } })).id;
});

const load = (id: number) => db.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { lines: { include: { shipmentLines: true }, orderBy: { id: "asc" } }, shipments: true } });

describe("purchase orders", () => {
  it("ships an order in parts and closes it when everything is shipped", async () => {
    const po = await createOrder({ supplierId: supplier, date: d("2034-01-10"), expectedDate: d("2034-03-01"), notes: null });
    expect(po.number).toBe("PO-2034-0001");
    expect(po.currency).toBe("EUR");
    const a = await addOrderLine(po.id, { itemId: itemA, qty: 100, unitPrice: "12.5" });
    const b = await addOrderLine(po.id, { itemId: itemB, qty: 40, unitPrice: 30 });

    // Nothing shipped yet, so the line can still change.
    await updateOrderLine(po.id, a.id, { qty: 120, unitPrice: "12.5" });

    const s1 = await shipFromOrder(po.id, { fxRate: "52", orderDate: d("2034-02-01"), lines: [{ orderLineId: a.id, qty: 70 }, { orderLineId: b.id, qty: 0 }] });
    expect(s1.ref).toMatch(/^SHP-2034-/);
    expect(s1.currency).toBe("EUR");
    expect(s1.purchaseOrderId).toBe(po.id);
    const lines = await db.shipmentLine.findMany({ where: { shipmentId: s1.id } });
    expect(lines.map((l) => [l.orderLineId, l.itemId, n(l.qty), n(l.unitPrice)])).toEqual([[a.id, itemA, 70, 12.5]]);

    let order = await load(po.id);
    let p = orderProgress(order);
    expect(p.lines.map((l) => [n(l.ordered), n(l.shipped), n(l.remaining)])).toEqual([[120, 70, 50], [40, 0, 40]]);
    expect(order.status).toBe("OPEN");
    // 70 × 12.5 = 875 of 1,500 + 1,200 = 2,700.
    expect(n(p.percentShipped.toDecimalPlaces(2))).toBe(32.41);

    // A shipped line is locked.
    await expect(updateOrderLine(po.id, a.id, { qty: 200, unitPrice: 1 })).rejects.toThrow(/already been shipped/);
    await expect(removeOrderLine(po.id, a.id)).rejects.toThrow(/already been shipped/);

    // More than what is left is refused, naming the product.
    await expect(shipFromOrder(po.id, { fxRate: "52", lines: [{ orderLineId: a.id, qty: 51 }] })).rejects.toThrow("Only 50 kg of Orders Linalool is left to ship on this order.");
    await expect(shipFromOrder(po.id, { fxRate: "52", lines: [{ orderLineId: a.id, qty: 30 }, { orderLineId: a.id, qty: 30 }] })).rejects.toThrow(/Only 50 kg/);

    // Cancelling is refused once goods have been shipped.
    await expect(cancelOrder(po.id)).rejects.toThrow(/can't be cancelled/);
    await expect(deleteOrder(po.id)).rejects.toThrow(/can be deleted/);

    // Still coming: 50 + 40 on the order, 70 on the shipment not yet received.
    let coming = await onOrder();
    expect(n(coming.get(itemA))).toBe(120);
    expect(n(coming.get(itemB))).toBe(40);

    await receiveShipment(s1.id, d("2034-02-20"));
    coming = await onOrder();
    expect(n(coming.get(itemA))).toBe(50);

    const s2 = await shipFromOrder(po.id, { fxRate: "53", orderDate: d("2034-03-01"), lines: [{ orderLineId: a.id, qty: 50 }, { orderLineId: b.id, qty: 40 }] });
    order = await load(po.id);
    p = orderProgress(order);
    expect(order.status).toBe("CLOSED");
    expect(p.done).toBe(true);
    expect(n(p.percentShipped)).toBe(100);
    expect(order.shipments.map((s) => s.id).sort()).toEqual([s1.id, s2.id].sort());

    // Closed orders can't be shipped from; only the shipment still on the way counts.
    await expect(shipFromOrder(po.id, { fxRate: "53", lines: [{ orderLineId: a.id, qty: 1 }] })).rejects.toThrow(/Only open/);
    coming = await onOrder();
    expect(n(coming.get(itemA))).toBe(50);
    expect(n(coming.get(itemB))).toBe(40);
  });

  it("closes by hand, reopens, cancels and deletes", async () => {
    const po = await createOrder({ supplierId: supplier, date: d("2034-04-01"), expectedDate: null, currency: "usd", notes: "Rush" });
    expect(po.currency).toBe("USD");
    const line = await addOrderLine(po.id, { itemId: itemB, qty: 10, unitPrice: 5 });
    expect(n((await onOrder()).get(itemB))).toBe(50);

    await closeOrder(po.id);
    expect(n((await onOrder()).get(itemB))).toBe(40);
    await expect(addOrderLine(po.id, { itemId: itemA, qty: 1, unitPrice: 1 })).rejects.toThrow(/Only open/);
    await reopenOrder(po.id);
    await removeOrderLine(po.id, line.id);

    await cancelOrder(po.id);
    expect((await db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status).toBe("CANCELLED");
    await expect(deleteOrder(po.id)).rejects.toThrow(/can be deleted/);

    const draft = await createOrder({ supplierId: supplier, date: d("2034-04-02"), expectedDate: null, notes: null });
    await deleteOrder(draft.id);
    expect(await db.purchaseOrder.findUnique({ where: { id: draft.id } })).toBeNull();
  });

  it("checks the dates and quantities given", async () => {
    await expect(createOrder({ supplierId: supplier, date: d("2034-05-02"), expectedDate: d("2034-05-01"), notes: null })).rejects.toThrow(/expected date/);
    const po = await createOrder({ supplierId: supplier, date: d("2034-05-02"), expectedDate: null, notes: null });
    await expect(addOrderLine(po.id, { itemId: itemA, qty: 0, unitPrice: 1 })).rejects.toThrow(/more than zero/);
    const line = await addOrderLine(po.id, { itemId: itemA, qty: 5, unitPrice: 1 });
    await expect(shipFromOrder(po.id, { fxRate: "0", lines: [{ orderLineId: line.id, qty: 1 }] })).rejects.toThrow(/Exchange rate/);
    await expect(shipFromOrder(po.id, { fxRate: "50", lines: [{ orderLineId: line.id, qty: 0 }] })).rejects.toThrow(/at least one product/);
    await expect(shipFromOrder(po.id, { fxRate: "50", etd: d("2034-05-10"), eta: d("2034-05-05"), lines: [{ orderLineId: line.id, qty: 1 }] })).rejects.toThrow(/Expected arrival/);
  });
});
