"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/forms";
import { decimal, fail, required, text } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { isValidCas } from "@/lib/chemistry";
import { db } from "@/lib/db";
import { UserError } from "@/lib/services/errors";

function itemData(fd: FormData) {
  const casNumber = text(fd, "casNumber");
  if (casNumber && !isValidCas(casNumber)) throw new UserError(`CAS number ${casNumber} isn't valid. Check the digits.`);
  return {
    code: required(fd, "code", "Code").toUpperCase(),
    name: required(fd, "name", "Name"),
    casNumber,
    unit: required(fd, "unit", "Unit"),
    hazardClass: text(fd, "hazardClass"),
    notes: text(fd, "notes"),
    etaItemCode: text(fd, "etaItemCode"),
    etaItemType: text(fd, "etaItemType") === "GS1" ? "GS1" : "EGS",
    minQty: text(fd, "minQty") ? decimal(fd, "minQty", "Alert level", { allowZero: true }) : null,
  };
}

export async function createItem(_: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  let id: number;
  try {
    id = (await db.item.create({ data: itemData(fd) })).id;
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/products");
  redirect(`/products/${id}`);
}

export async function updateItem(id: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  try {
    await db.item.update({ where: { id }, data: { ...itemData(fd), active: fd.get("active") === "on" } });
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/products/${id}`);
  return { ok: "Saved." };
}
