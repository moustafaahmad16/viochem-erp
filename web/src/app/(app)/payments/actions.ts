"use server";

import type { PaymentMethod } from "@prisma/client";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/forms";
import { date, decimal, fail, required, text } from "@/lib/actions";
import { requireAdmin, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { recordCustomerPayment, recordSupplierPayment } from "@/lib/services/payments";

const optionalId = (fd: FormData, name: string) => {
  const v = text(fd, name);
  return v ? Number(v) : null;
};

const common = (fd: FormData) => ({
  date: date(fd, "date", "Date"),
  amount: decimal(fd, "amount", "Amount"),
  method: required(fd, "method", "Paid by") as PaymentMethod,
  reference: text(fd, "reference"),
  notes: text(fd, "notes"),
  accountId: optionalId(fd, "accountId"),
});

export async function receivePayment(customerId: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  let p;
  try {
    p = await recordCustomerPayment(customerId, { ...common(fd), invoiceId: optionalId(fd, "invoiceId") });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/", "layout");
  return { ok: `Saved as ${p.number}: EGP ${money(p.amount)} received.` };
}

export async function paySupplier(supplierId: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  let p;
  try {
    const currency = required(fd, "currency", "Currency");
    p = await recordSupplierPayment(supplierId, {
      ...common(fd),
      currency,
      fxRate: currency === "EGP" ? "1" : decimal(fd, "fxRate", "Exchange rate"),
      shipmentId: optionalId(fd, "shipmentId"),
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/", "layout");
  return { ok: `Saved as ${p.number}: ${p.currency} ${money(p.amount)} paid.` };
}

export async function deleteCustomerPayment(id: number) {
  await requireAdmin();
  await db.customerPayment.delete({ where: { id } });
  revalidatePath("/", "layout");
}

export async function deleteSupplierPayment(id: number) {
  await requireAdmin();
  await db.supplierPayment.delete({ where: { id } });
  revalidatePath("/", "layout");
}
