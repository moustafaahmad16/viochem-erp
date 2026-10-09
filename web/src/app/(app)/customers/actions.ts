"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/forms";
import { decimal, fail, optionalDate, required, text } from "@/lib/actions";
import { UserError } from "@/lib/services/errors";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

const data = (fd: FormData) => ({
  name: required(fd, "name", "Name"),
  taxId: text(fd, "taxId"),
  phone: text(fd, "phone"),
  email: text(fd, "email"),
  address: text(fd, "address"),
  etaType: ["B", "P", "F"].includes(text(fd, "etaType") ?? "") ? text(fd, "etaType")! : "B",
  country: (text(fd, "country") ?? "EG").toUpperCase(),
  governate: text(fd, "governate"),
  city: text(fd, "city"),
  street: text(fd, "street"),
  buildingNo: text(fd, "buildingNo"),
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
