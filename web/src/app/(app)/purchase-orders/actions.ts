"use server";

import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/forms";
import { date, decimal, fail, int, optionalDate, required, text } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { UserError } from "@/lib/services/errors";
import * as orders from "@/lib/services/orders";

const path = (id: number) => `/purchase-orders/${id}`;

function refresh(id: number) {
  revalidatePath(path(id));
  revalidatePath("/purchase-orders");
}

export async function createOrder(_: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  let id: number;
  try {
    id = (
      await orders.createOrder({
        supplierId: int(fd, "supplierId", "Supplier"),
        date: date(fd, "date", "Order date"),
        expectedDate: optionalDate(fd, "expectedDate"),
        currency: text(fd, "currency"),
        notes: text(fd, "notes"),
      })
    ).id;
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/purchase-orders");
  redirect(path(id));
}

export async function updateOrder(id: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  try {
    await orders.updateOrder(id, {
      supplierId: int(fd, "supplierId", "Supplier"),
      date: date(fd, "date", "Order date"),
      expectedDate: optionalDate(fd, "expectedDate"),
      currency: required(fd, "currency", "Currency"),
      notes: text(fd, "notes"),
    });
  } catch (e) {
    return fail(e);
  }
  refresh(id);
  return { ok: "Saved." };
}

export async function addLine(id: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  try {
    await orders.addOrderLine(id, {
      itemId: int(fd, "itemId", "Product"),
      qty: decimal(fd, "qty", "Quantity"),
      unitPrice: decimal(fd, "unitPrice", "Price", { allowZero: true }),
    });
  } catch (e) {
    return fail(e);
  }
  refresh(id);
  return { ok: "Product added." };
}

export async function updateLine(id: number, lineId: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  try {
    await orders.updateOrderLine(id, lineId, {
      qty: decimal(fd, "qty", "Quantity"),
      unitPrice: decimal(fd, "unitPrice", "Price", { allowZero: true }),
    });
  } catch (e) {
    return fail(e);
  }
  refresh(id);
  return { ok: "Saved." };
}

export async function removeLine(id: number, lineId: number) {
  await requireUser();
  await orders.removeOrderLine(id, lineId);
  refresh(id);
}

export async function shipFromOrder(id: number, lineIds: number[], _: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  let shipmentId: number;
  try {
    const lines = lineIds.map((lineId) => {
      const raw = (text(fd, `qty_${lineId}`) ?? "0").replace(/,/g, "");
      let qty: Decimal;
      try {
        qty = new Decimal(raw);
      } catch {
        throw new UserError("Quantity must be a number.");
      }
      return { orderLineId: lineId, qty };
    });
    shipmentId = (
      await orders.shipFromOrder(id, {
        fxRate: decimal(fd, "fxRate", "Exchange rate"),
        orderDate: date(fd, "orderDate", "Order date"),
        etd: optionalDate(fd, "etd"),
        eta: optionalDate(fd, "eta"),
        supplierInvoiceNo: text(fd, "supplierInvoiceNo"),
        lines,
      })
    ).id;
  } catch (e) {
    return fail(e);
  }
  refresh(id);
  revalidatePath("/shipments");
  redirect(`/shipments/${shipmentId}`);
}

async function run(id: number, fn: (id: number) => Promise<unknown>, ok: string): Promise<FormState> {
  await requireUser();
  try {
    await fn(id);
  } catch (e) {
    return fail(e);
  }
  refresh(id);
  return { ok };
}

export async function closeOrder(id: number): Promise<FormState> {
  return run(id, orders.closeOrder, "Closed. Nothing more is expected on this order.");
}

export async function reopenOrder(id: number): Promise<FormState> {
  return run(id, orders.reopenOrder, "Reopened.");
}

export async function cancelOrder(id: number): Promise<FormState> {
  return run(id, orders.cancelOrder, "Cancelled.");
}

export async function deleteOrder(id: number): Promise<FormState> {
  await requireUser();
  try {
    await orders.deleteOrder(id);
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/purchase-orders");
  redirect("/purchase-orders");
}
