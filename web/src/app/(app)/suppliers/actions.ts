"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/forms";
import { decimal, fail, optionalDate, required, text } from "@/lib/actions";
import { UserError } from "@/lib/services/errors";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

const data = (fd: FormData) => ({
  name: required(fd, "name", "Name"),
  country: text(fd, "country"),
  currency: required(fd, "currency", "Currency").toUpperCase(),
  email: text(fd, "email"),
  phone: text(fd, "phone"),
  notes: text(fd, "notes"),
  paymentTermsDays: terms(fd),
  openingBalance: text(fd, "openingBalance") ? decimal(fd, "openingBalance", "Opening balance", { min: -1e12, allowZero: true }) : "0",
  openingBalanceDate: optionalDate(fd, "openingBalanceDate"),
});

function terms(fd: FormData) {
  const n = Number(text(fd, "paymentTermsDays") ?? 0);
  if (!Number.isInteger(n) || n < 0 || n > 365) throw new UserError("Payment terms must be a whole number of days, 0 to 365.");
  return n;
}

export async function createSupplier(_: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  try {
    await db.supplier.create({ data: data(fd) });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/suppliers");
  return { ok: "Supplier added." };
}

export async function updateSupplier(id: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  try {
    await db.supplier.update({ where: { id }, data: data(fd) });
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/suppliers/${id}`);
  return { ok: "Saved." };
}
