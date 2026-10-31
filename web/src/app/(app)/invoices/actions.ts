"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/forms";
import { date, decimal, fail, int, text } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { invoiceTotals, WHT_RATE } from "@/lib/costing";
import { creditCheck } from "@/lib/services/credit";
import { formatDate } from "@/lib/dates";
import { batchName, isExpired } from "@/lib/services/batches";
import { UserError } from "@/lib/services/errors";
import { cancelOnEta, refreshStatus } from "@/lib/services/einvoice";
import { cancelInvoice as cancel, createInvoice as create, postInvoice as post, uniqueInvoiceNumber } from "@/lib/services/inventory";

async function draft(id: number) {
  const inv = await db.invoice.findUniqueOrThrow({ where: { id } });
  if (inv.status !== "DRAFT") throw new UserError("Only draft invoices can be changed.");
  return inv;
}

export async function createInvoice(_: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  let id: number;
  try {
    id = (await create(int(fd, "customerId", "Customer"), date(fd, "date", "Invoice date"), { number: text(fd, "number"), deliveryNoteNo: text(fd, "deliveryNoteNo"), whtRate: fd.get("wht") ? WHT_RATE : 0 })).id;
  } catch (e) {
    return fail(e);
  }
  redirect(`/invoices/${id}`);
}

export async function updateInvoice(id: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  try {
    const inv = await draft(id);
    const number = text(fd, "number") ?? inv.number;
    await uniqueInvoiceNumber(db, number, id);
    await db.invoice.update({
      where: { id },
      data: {
        number,
        deliveryNoteNo: text(fd, "deliveryNoteNo"),
        customerId: int(fd, "customerId", "Customer"),
        date: date(fd, "date", "Invoice date"),
        vatRate: decimal(fd, "vatRate", "VAT rate", { allowZero: true }),
        whtRate: fd.get("wht") ? WHT_RATE : 0,
        notes: text(fd, "notes"),
      },
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/invoices/${id}`);
  return { ok: "Saved." };
}

export async function addLine(id: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  try {
    await draft(id);
    const itemId = int(fd, "itemId", "Product");
    const lotValue = text(fd, "lotId");
    const lotId = lotValue ? Number(lotValue) : null;
    if (lotId) {
      const lot = await db.lot.findUnique({ where: { id: lotId } });
      if (!lot || lot.itemId !== itemId) throw new UserError("That batch is for a different product.");
      const inv = await db.invoice.findUniqueOrThrow({ where: { id } });
      if (isExpired(lot, inv.date)) throw new UserError(`Batch ${batchName(lot)} expired on ${formatDate(lot.expiryDate)}, so it can't be sold.`);
    }
    await db.invoiceLine.create({
      data: { invoiceId: id, itemId, lotId, qty: decimal(fd, "qty", "Quantity"), unitPrice: decimal(fd, "unitPrice", "Price", { allowZero: true }) },
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/invoices/${id}`);
  return { ok: "Product added." };
}

export async function removeLine(id: number, lineId: number) {
  await requireUser();
  await draft(id);
  await db.invoiceLine.delete({ where: { id: lineId, invoiceId: id } });
  revalidatePath(`/invoices/${id}`);
}

export async function postInvoice(id: number, _: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    const inv = await db.invoice.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    const check = await creditCheck(inv.customerId, invoiceTotals(inv.lines, inv.vatRate.toString(), inv.whtRate.toString()).due);
    if (check.overLimit && !(user.role === "ADMIN" && fd.get("overLimit") === "on")) {
      throw new UserError(`${check.warnings[0]} ${user.role === "ADMIN" ? "Tick \"Post anyway\" to post it." : "Ask an admin to post it."}`);
    }
    await post(id);
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/invoices/${id}`);
  return { ok: "Posted. The stock has been taken out." };
}

export async function cancelInvoice(id: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  try {
    await cancelOnEta(id, text(fd, "reason") ?? "Cancelled by the seller");
    await cancel(id);
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/invoices/${id}`);
  return { ok: "Cancelled. The stock is back in its batches." };
}

export async function deleteDraft(id: number) {
  await requireUser();
  await draft(id);
  await db.invoice.delete({ where: { id } });
  redirect("/invoices");
}

export async function checkEta(id: number): Promise<FormState> {
  await requireUser();
  try {
    await refreshStatus(id);
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/invoices/${id}`);
  return { ok: "Updated." };
}
