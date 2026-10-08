"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/forms";
import { fail, required, text } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

const data = (fd: FormData) => ({
  name: required(fd, "name", "Name"),
  taxId: text(fd, "taxId"),
  phone: text(fd, "phone"),
  email: text(fd, "email"),
  address: text(fd, "address"),
  notes: text(fd, "notes"),
});

export async function createCustomer(_: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  try {
    await db.customer.create({ data: data(fd) });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/customers");
  return { ok: "Customer added." };
}

export async function updateCustomer(id: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  try {
    await db.customer.update({ where: { id }, data: data(fd) });
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/customers/${id}`);
  return { ok: "Saved." };
}
