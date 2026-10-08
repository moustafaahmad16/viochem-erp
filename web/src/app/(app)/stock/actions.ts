"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/forms";
import { date, decimal, fail, int, optionalDate, text } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { addOpeningStock, adjustLot as adjust } from "@/lib/services/inventory";

export async function createOpeningStock(_: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  let lotId: number;
  try {
    lotId = (
      await addOpeningStock({
        itemId: int(fd, "itemId", "Product"),
        qty: decimal(fd, "qty", "Quantity"),
        unitCostEgp: decimal(fd, "unitCostEgp", "Cost", { allowZero: true }),
        date: date(fd, "date", "Date"),
        expiryDate: optionalDate(fd, "expiryDate"),
        supplierBatchNo: text(fd, "supplierBatchNo"),
      })
    ).id;
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/stock");
  redirect(`/stock/lots/${lotId}`);
}

export async function adjustLot(lotId: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  try {
    await adjust(lotId, decimal(fd, "counted", "Counted quantity", { allowZero: true }), text(fd, "note") ?? "");
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/stock/lots/${lotId}`);
  return { ok: "Stock corrected." };
}
