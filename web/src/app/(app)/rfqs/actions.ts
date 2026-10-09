"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/forms";
import { date, decimal, fail, optionalDate, text } from "@/lib/actions";
import { today } from "@/lib/dates";
import { requireUser } from "@/lib/auth";
import { readReply } from "@/lib/rfq/sheet";
import { UserError } from "@/lib/services/errors";
import * as rfqs from "@/lib/services/rfq";

const path = (id: number) => `/rfqs/${id}`;
const MAX_BYTES = 5 * 1024 * 1024;

function refresh(id: number) {
  revalidatePath(path(id));
  revalidatePath("/rfqs");
}

async function run(id: number, fn: () => Promise<unknown>, ok: string): Promise<FormState> {
  await requireUser();
  try {
    await fn();
  } catch (e) {
    return fail(e);
  }
  refresh(id);
  return { ok };
}


/** The product rows of the form: item_0/qty_0, item_1/qty_1… Empty rows are skipped. */
function productRows(fd: FormData) {
  const lines: { itemId: number; qty: string }[] = [];
  for (let i = 0; fd.has(`item_${i}`); i++) {
    const item = text(fd, `item_${i}`);
    const qty = text(fd, `qty_${i}`)?.replace(/,/g, "");
    if (!item && !qty) continue;
    if (!item) throw new UserError("Choose the product on every line, or remove the empty line.");
    if (!qty || !(Number(qty) > 0)) throw new UserError("Enter a quantity for every product.");
    if (lines.some((l) => l.itemId === Number(item))) throw new UserError("A product is listed twice. Put the total quantity on one line.");
    lines.push({ itemId: Number(item), qty });
  }
  return lines;
}

/** Start a request with its products, dated today. */
export async function createRfq(_: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  let id: number;
  try {
    const lines = productRows(fd);
    if (!lines.length) throw new UserError("Add at least one product.");
    id = (await rfqs.createRfq({ date: today(), replyBy: null, neededBy: optionalDate(fd, "neededBy"), notes: text(fd, "notes"), lines })).id;
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/rfqs");
  redirect(path(id));
}

export async function saveLines(id: number, _: FormState, fd: FormData): Promise<FormState> {
  return run(id, async () => rfqs.saveLines(id, productRows(fd)), "Saved.");
}

export async function updateRfq(id: number, _: FormState, fd: FormData): Promise<FormState> {
  return run(id, () => rfqs.updateRfq(id, { date: date(fd, "date", "Date"), replyBy: null, neededBy: optionalDate(fd, "neededBy"), notes: text(fd, "notes") }), "Saved.");
}





export async function removeSupplier(id: number, supplierId: number) {
  await requireUser();
  await rfqs.removeSupplier(id, supplierId);
  refresh(id);
}

export async function uploadReply(id: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an Excel file first." };
  if (file.size > MAX_BYTES) return { error: "That file is over 5 MB. Split it into smaller files." };
  let done: { supplier: string; priced: number };
  try {
    const chosen = text(fd, "supplierId");
    const reply = await readReply(await file.arrayBuffer());
    done = await rfqs.loadReply(id, chosen ? Number(chosen) : null, reply);
  } catch (e) {
    if (e instanceof Error && /couldn't be opened|isn't a VIOCHEM|is missing from the sheet/.test(e.message)) return { error: e.message };
    return fail(e);
  }
  refresh(id);
  return { ok: `Loaded ${done.priced} prices from ${done.supplier}.` };
}



export async function setRate(id: number, currency: string, _: FormState, fd: FormData): Promise<FormState> {
  return run(id, () => rfqs.setRate(id, currency, decimal(fd, "rate", "Exchange rate")), "Rate saved.");
}

export async function chooseQuote(id: number, quoteId: number) {
  await requireUser();
  await rfqs.chooseQuote(id, quoteId);
  refresh(id);
}




/** Order the suggested offers, or the ones chosen by hand, one purchase order per supplier. */
export async function orderSuggested(id: number): Promise<FormState> {
  await requireUser();
  try {
    await rfqs.orderSuggested(id);
  } catch (e) {
    return fail(e);
  }
  refresh(id);
  revalidatePath("/purchase-orders");
  return { ok: "Purchase orders made." };
}

export async function cancelRfq(id: number): Promise<FormState> {
  return run(id, () => rfqs.cancelRfq(id), "Cancelled.");
}

export async function reopenRfq(id: number): Promise<FormState> {
  return run(id, () => rfqs.reopenRfq(id), "Reopened.");
}

export async function deleteRfq(id: number): Promise<FormState> {
  await requireUser();
  try {
    await rfqs.deleteRfq(id);
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/rfqs");
  redirect("/rfqs");
}
