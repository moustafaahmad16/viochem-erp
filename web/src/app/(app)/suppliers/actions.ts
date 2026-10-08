"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/forms";
import { fail, required, text } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

const data = (fd: FormData) => ({
  name: required(fd, "name", "Name"),
  country: text(fd, "country"),
  currency: required(fd, "currency", "Currency").toUpperCase(),
  email: text(fd, "email"),
  phone: text(fd, "phone"),
  notes: text(fd, "notes"),
});

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
