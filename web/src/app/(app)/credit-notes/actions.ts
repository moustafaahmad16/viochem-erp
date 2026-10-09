"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/forms";
import { date, decimal, fail, int, required, text } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { addCreditLine, cancelCreditNote as cancel, createCreditNote as create, deleteCreditNote, postCreditNote as post, removeCreditLine } from "@/lib/services/credits";
import { cancelCreditNoteOnEta, refreshCreditNoteStatus, sendCreditNote } from "@/lib/services/einvoice";

const refresh = (id: number) => {
  revalidatePath(`/credit-notes/${id}`);
  revalidatePath("/credit-notes");
};

export async function createCreditNote(invoiceId: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  let id: number;
  try {
    id = (await create(invoiceId, date(fd, "date", "Date"), required(fd, "reason", "Reason"))).id;
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/invoices/${invoiceId}`);
  redirect(`/credit-notes/${id}`);
}

export async function addLine(id: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  try {
    await addCreditLine(id, {
      invoiceLineId: int(fd, "invoiceLineId", "Product"),
      qty: decimal(fd, "qty", "Quantity"),
      unitPrice: text(fd, "unitPrice") ? decimal(fd, "unitPrice", "Price") : null,
      restock: fd.get("restock") === "on",
    });
  } catch (e) {
    return fail(e);
  }
  refresh(id);
  return { ok: "Product added." };
}

export async function removeLine(id: number, lineId: number) {
  await requireUser();
  await removeCreditLine(id, lineId);
  refresh(id);
}

export async function postCreditNote(id: number): Promise<FormState> {
  await requireUser();
  try {
    await post(id);
  } catch (e) {
    return fail(e);
  }
  refresh(id);
  return { ok: "Posted. Returned goods are back in stock." };
}

export async function cancelCreditNote(id: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  try {
    await cancelCreditNoteOnEta(id, text(fd, "reason") ?? "Cancelled by the seller");
    await cancel(id);
  } catch (e) {
    return fail(e);
  }
  refresh(id);
  return { ok: "Cancelled. Returned goods have been taken out of stock again." };
}

export async function deleteDraft(id: number) {
  await requireUser();
  await deleteCreditNote(id);
  redirect("/credit-notes");
}

export async function sendToEta(id: number): Promise<FormState> {
  await requireUser();
  let status;
  try {
    status = (await sendCreditNote(id)).etaStatus;
  } catch (e) {
    return fail(e);
  }
  refresh(id);
  return status === "SUBMITTED" ? { ok: "Sent. The tax authority is checking it; check again in a minute." } : { error: "The tax authority refused it. The reasons are shown above." };
}

export async function checkEta(id: number): Promise<FormState> {
  await requireUser();
  try {
    await refreshCreditNoteStatus(id);
  } catch (e) {
    return fail(e);
  }
  refresh(id);
  return { ok: "Updated." };
}
