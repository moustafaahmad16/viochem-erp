"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/forms";
import { date, decimal, fail, int, required, text } from "@/lib/actions";
import { requireAdmin, requireUser } from "@/lib/auth";
import * as cheques from "@/lib/services/cheques";

const optionalId = (fd: FormData, name: string) => {
  const v = text(fd, name);
  return v ? Number(v) : null;
};

const common = (fd: FormData) => ({
  chequeNo: required(fd, "chequeNo", "Cheque number"),
  bank: text(fd, "bank"),
  date: date(fd, "date", "Date"),
  dueDate: date(fd, "dueDate", "Date on the cheque"),
  amount: decimal(fd, "amount", "Amount"),
  notes: text(fd, "notes"),
});

export async function receiveCheque(_: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  let id: number;
  try {
    id = (await cheques.receiveCheque({ ...common(fd), customerId: int(fd, "customerId", "Customer"), invoiceId: optionalId(fd, "invoiceId") })).id;
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/", "layout");
  redirect(`/cheques/${id}`);
}

export async function issueCheque(_: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  let id: number;
  try {
    id = (
      await cheques.issueCheque({
        ...common(fd),
        supplierId: int(fd, "supplierId", "Supplier"),
        shipmentId: optionalId(fd, "shipmentId"),
        accountId: optionalId(fd, "accountId"),
      })
    ).id;
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/", "layout");
  redirect(`/cheques/${id}`);
}

async function change(run: () => Promise<unknown>, ok: string): Promise<FormState> {
  try {
    await run();
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/", "layout");
  return { ok };
}

export async function depositCheque(id: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  return change(() => cheques.depositCheque(id, optionalId(fd, "accountId"), date(fd, "date", "Date")), "Deposited.");
}

export async function clearCheque(id: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  return change(() => cheques.clearCheque(id, date(fd, "date", "Date")), "Cleared. The money has moved.");
}

export async function bounceCheque(id: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  return change(() => cheques.bounceCheque(id, date(fd, "date", "Date")), "Marked as bounced. The amount is owed again.");
}

export async function reopenCheque(id: number): Promise<FormState> {
  await requireAdmin();
  return change(() => cheques.reopenCheque(id), "Back to pending.");
}

export async function deleteCheque(id: number): Promise<FormState> {
  await requireUser();
  try {
    await cheques.deleteCheque(id);
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/", "layout");
  redirect("/cheques");
}
