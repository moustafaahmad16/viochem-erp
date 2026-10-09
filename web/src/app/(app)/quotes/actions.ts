"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/forms";
import { date, decimal, fail, int, optionalDate, text } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import * as svc from "@/lib/services/quotes";

export async function createQuote(_: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  let id: number;
  try {
    id = (await svc.createQuote(int(fd, "customerId", "Customer"), date(fd, "date", "Quotation date"), optionalDate(fd, "validUntil"))).id;
  } catch (e) {
    return fail(e);
  }
  redirect(`/quotes/${id}`);
}

export async function updateQuote(id: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  try {
    await svc.updateQuote(id, {
      customerId: int(fd, "customerId", "Customer"),
      date: date(fd, "date", "Quotation date"),
      validUntil: optionalDate(fd, "validUntil"),
      vatRate: decimal(fd, "vatRate", "VAT rate", { allowZero: true }),
      notes: text(fd, "notes"),
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/quotes/${id}`);
  return { ok: "Saved." };
}

export async function addLine(id: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  try {
    await svc.addQuoteLine(id, {
      itemId: int(fd, "itemId", "Product"),
      qty: decimal(fd, "qty", "Quantity"),
      unitPrice: decimal(fd, "unitPrice", "Price", { allowZero: true }),
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/quotes/${id}`);
  return { ok: "Product added." };
}

export async function removeLine(id: number, lineId: number) {
  await requireUser();
  await svc.removeQuoteLine(id, lineId);
  revalidatePath(`/quotes/${id}`);
}

export async function declineQuote(id: number): Promise<FormState> {
  await requireUser();
  try {
    await svc.declineQuote(id);
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/quotes/${id}`);
  return { ok: "Marked as declined." };
}

export async function reopenQuote(id: number): Promise<FormState> {
  await requireUser();
  try {
    await svc.reopenQuote(id);
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/quotes/${id}`);
  return { ok: "Reopened." };
}

export async function deleteQuote(id: number): Promise<FormState> {
  await requireUser();
  try {
    await svc.deleteQuote(id);
  } catch (e) {
    return fail(e);
  }
  redirect("/quotes");
}

export async function toInvoice(id: number): Promise<FormState> {
  await requireUser();
  let invoiceId: number;
  try {
    invoiceId = (await svc.quoteToInvoice(id)).id;
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/quotes");
  revalidatePath(`/quotes/${id}`);
  redirect(`/invoices/${invoiceId}`);
}
