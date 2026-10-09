"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/forms";
import { date, decimal, fail, int, optionalDate, required, text } from "@/lib/actions";
import { requireAdmin, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordTransfer } from "@/lib/services/banking";
import { UserError } from "@/lib/services/errors";

const data = (fd: FormData) => {
  const kind = required(fd, "kind", "Type");
  if (kind !== "BANK" && kind !== "CASH") throw new UserError("Choose bank or cash.");
  return {
    name: required(fd, "name", "Name"),
    kind: kind as "BANK" | "CASH",
    currency: required(fd, "currency", "Currency").toUpperCase(),
    openingBalance: text(fd, "openingBalance") ? decimal(fd, "openingBalance", "Opening balance", { min: -1e12, allowZero: true }) : "0",
    openingDate: optionalDate(fd, "openingDate"),
    notes: text(fd, "notes"),
  };
};

export async function createAccount(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  try {
    await db.moneyAccount.create({ data: data(fd) });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/accounts");
  return { ok: "Account added." };
}

export async function updateAccount(id: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  try {
    const used = await db.moneyAccount.findUniqueOrThrow({ where: { id } });
    const d = data(fd);
    if (d.currency !== used.currency) throw new UserError("An account's currency can't change. Add a new account instead.");
    await db.moneyAccount.update({ where: { id }, data: { ...d, active: fd.get("active") === "on" } });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/accounts", "layout");
  return { ok: "Saved." };
}

export async function transfer(fromAccountId: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  try {
    await recordTransfer({
      date: date(fd, "date", "Date"),
      fromAccountId,
      toAccountId: int(fd, "toAccountId", "Account"),
      amount: decimal(fd, "amount", "Amount"),
      toAmount: text(fd, "toAmount") ? decimal(fd, "toAmount", "Amount received") : null,
      note: text(fd, "note"),
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/accounts", "layout");
  return { ok: "Transfer saved." };
}
