"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/forms";
import { date, decimal, fail, required, text } from "@/lib/actions";
import { requireAdmin, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { recordExpense } from "@/lib/services/banking";

export async function addExpense(_: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  let e;
  try {
    e = await recordExpense({
      date: date(fd, "date", "Date"),
      category: required(fd, "category", "Category"),
      description: text(fd, "description"),
      payee: text(fd, "payee"),
      amount: decimal(fd, "amount", "Amount"),
      vat: text(fd, "vat") ? decimal(fd, "vat", "VAT", { allowZero: true }) : "0",
      accountId: text(fd, "accountId") ? Number(text(fd, "accountId")) : null,
      reference: text(fd, "reference"),
    });
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/", "layout");
  return { ok: `Saved as ${e.number}: EGP ${money(e.amount)}.` };
}

export async function deleteExpense(id: number) {
  await requireAdmin();
  await db.expense.delete({ where: { id } });
  revalidatePath("/", "layout");
}
