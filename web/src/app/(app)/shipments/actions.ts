"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/forms";
import { date, decimal, fail, int, optionalDate, required, text } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { shipmentDateProblem } from "@/lib/dates";
import { db } from "@/lib/db";
import { activeAccount } from "@/lib/services/banking";
import { UserError } from "@/lib/services/errors";
import { createShipment as create, receiveShipment as receive, recostShipment } from "@/lib/services/inventory";

const ALLOCATIONS = ["VALUE", "QUANTITY"] as const;
const STATUSES = ["ORDERED", "IN_TRANSIT", "AT_CUSTOMS"] as const;

function allocation(fd: FormData) {
  const a = text(fd, "allocation") ?? "VALUE";
  if (!ALLOCATIONS.includes(a as never)) throw new UserError("Choose how to spread the charges.");
  return a as (typeof ALLOCATIONS)[number];
}

function checkDates(etd: Date | null, eta: Date | null, arrival: Date | null) {
  const problem = shipmentDateProblem(etd, eta, arrival);
  if (problem) throw new UserError(problem);
}

export async function createShipment(_: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  let id: number;
  try {
    const etd = optionalDate(fd, "etd");
    const eta = optionalDate(fd, "eta");
    checkDates(etd, eta, null);
    id = (
      await create({
        supplierId: int(fd, "supplierId", "Supplier"),
        currency: required(fd, "currency", "Currency"),
        fxRate: decimal(fd, "fxRate", "Exchange rate"),
        orderDate: date(fd, "orderDate", "Order date"),
        etd,
        eta,
        supplierInvoiceNo: text(fd, "supplierInvoiceNo"),
        allocation: allocation(fd),
        notes: text(fd, "notes"),
      })
    ).id;
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/shipments");
  redirect(`/shipments/${id}`);
}

async function editable(id: number) {
  const s = await db.shipment.findUniqueOrThrow({ where: { id } });
  if (s.status === "RECEIVED") throw new UserError("This shipment is already received, so its products can't change.");
  return s;
}

export async function updateShipment(id: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  try {
    const s = await db.shipment.findUniqueOrThrow({ where: { id } });
    const etd = optionalDate(fd, "etd");
    const eta = optionalDate(fd, "eta");
    checkDates(etd, eta, s.arrivalDate);
    const common = { etd, eta, dueDate: optionalDate(fd, "dueDate"), supplierInvoiceNo: text(fd, "supplierInvoiceNo"), notes: text(fd, "notes") };
    if (s.status === "RECEIVED") {
      await db.shipment.update({ where: { id }, data: common });
    } else {
      const status = required(fd, "status", "Status");
      if (!STATUSES.includes(status as never)) throw new UserError("Choose a status.");
      await db.shipment.update({
        where: { id },
        data: {
          ...common,
          status: status as (typeof STATUSES)[number],
          fxRate: decimal(fd, "fxRate", "Exchange rate"),
          allocation: allocation(fd),
          orderDate: date(fd, "orderDate", "Order date"),
        },
      });
    }
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/shipments/${id}`);
  return { ok: "Saved." };
}

export async function addLine(id: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  try {
    await editable(id);
    await db.shipmentLine.create({
      data: {
        shipmentId: id,
        itemId: int(fd, "itemId", "Product"),
        qty: decimal(fd, "qty", "Quantity"),
        unitPrice: decimal(fd, "unitPrice", "Price", { allowZero: true }),
        supplierBatchNo: text(fd, "supplierBatchNo"),
        expiryDate: optionalDate(fd, "expiryDate"),
      },
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/shipments/${id}`);
  return { ok: "Product added." };
}

export async function removeLine(id: number, lineId: number) {
  await requireUser();
  await editable(id);
  await db.shipmentLine.delete({ where: { id: lineId, shipmentId: id } });
  revalidatePath(`/shipments/${id}`);
}

// Charges can change after receiving: the lots and past sales are re-costed straight away.
export async function addCharge(id: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  try {
    const data = {
      shipmentId: id,
      kind: required(fd, "kind", "Charge"),
      description: text(fd, "description"),
      amountEgp: decimal(fd, "amountEgp", "Amount"),
      date: optionalDate(fd, "date"),
      accountId: text(fd, "accountId") ? Number(text(fd, "accountId")) : null,
    };
    await db.$transaction(async (tx) => {
      await activeAccount(tx, data.accountId, { egpOnly: true });
      await tx.shipmentCharge.create({ data });
      await recostShipment(tx, id);
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/shipments/${id}`);
  return { ok: "Charge added." };
}

export async function removeCharge(id: number, chargeId: number) {
  await requireUser();
  await db.$transaction(async (tx) => {
    await tx.shipmentCharge.delete({ where: { id: chargeId, shipmentId: id } });
    await recostShipment(tx, id);
  });
  revalidatePath(`/shipments/${id}`);
}

export async function receiveShipment(id: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  try {
    await receive(id, date(fd, "arrivalDate", "Arrival date"));
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/shipments/${id}`);
  revalidatePath("/stock");
  return { ok: "Received. The stock is now available to sell." };
}
