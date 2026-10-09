"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/forms";
import { date, decimal, fail, int, optionalDate, required, text } from "@/lib/actions";
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

const optionalInt = (fd: FormData, name: string, label: string) => {
  const v = text(fd, name);
  if (v === null) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new UserError(`${label} should be whole days.`);
  return n;
};

/** Start a request. Lines come as qty_<itemId> fields, so it can start from the low-stock list. */
export async function createRfq(_: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  let id: number;
  try {
    const lines = [...fd.entries()]
      .filter(([k, v]) => k.startsWith("qty_") && typeof v === "string" && v.trim())
      .map(([k, v]) => ({ itemId: Number(k.slice(4)), qty: String(v).replace(/,/g, "") }))
      .filter((l) => Number(l.qty) > 0);
    id = (
      await rfqs.createRfq({
        date: date(fd, "date", "Date"),
        replyBy: optionalDate(fd, "replyBy"),
        neededBy: optionalDate(fd, "neededBy"),
        notes: text(fd, "notes"),
        lines,
      })
    ).id;
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/rfqs");
  redirect(path(id));
}

export async function updateRfq(id: number, _: FormState, fd: FormData): Promise<FormState> {
  return run(id, () => rfqs.updateRfq(id, { date: date(fd, "date", "Date"), replyBy: optionalDate(fd, "replyBy"), neededBy: optionalDate(fd, "neededBy"), notes: text(fd, "notes") }), "Saved.");
}

export async function addLine(id: number, _: FormState, fd: FormData): Promise<FormState> {
  return run(id, () => rfqs.addRfqLine(id, { itemId: int(fd, "itemId", "Product"), qty: decimal(fd, "qty", "Quantity"), notes: text(fd, "notes") }), "Product added.");
}

export async function updateLine(id: number, lineId: number, _: FormState, fd: FormData): Promise<FormState> {
  return run(id, () => rfqs.updateRfqLine(id, lineId, { qty: decimal(fd, "qty", "Quantity"), notes: text(fd, "notes") }), "Saved.");
}

export async function removeLine(id: number, lineId: number) {
  await requireUser();
  await rfqs.removeRfqLine(id, lineId);
  refresh(id);
}

export async function inviteSupplier(id: number, _: FormState, fd: FormData): Promise<FormState> {
  return run(id, () => rfqs.inviteSupplier(id, int(fd, "supplierId", "Supplier")), "Supplier added.");
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

export async function saveQuote(id: number, _: FormState, fd: FormData): Promise<FormState> {
  return run(
    id,
    () =>
      rfqs.saveQuote(id, {
        lineId: int(fd, "lineId", "Product"),
        supplierId: int(fd, "supplierId", "Supplier"),
        currency: required(fd, "currency", "Currency"),
        unitPrice: decimal(fd, "unitPrice", "Price"),
        moq: text(fd, "moq") ? decimal(fd, "moq", "Minimum order qty") : null,
        leadTimeDays: optionalInt(fd, "leadTimeDays", "Lead time"),
        paymentTermsDays: optionalInt(fd, "paymentTermsDays", "Payment terms"),
        validUntil: optionalDate(fd, "validUntil"),
        incoterm: text(fd, "incoterm")?.toUpperCase() ?? null,
        notes: text(fd, "notes"),
      }),
    "Price saved.",
  );
}

export async function deleteQuote(id: number, quoteId: number) {
  await requireUser();
  await rfqs.deleteQuote(id, quoteId);
  refresh(id);
}

export async function setRate(id: number, currency: string, _: FormState, fd: FormData): Promise<FormState> {
  return run(id, () => rfqs.setRate(id, currency, decimal(fd, "rate", "Exchange rate")), "Rate saved.");
}

export async function chooseQuote(id: number, quoteId: number) {
  await requireUser();
  await rfqs.chooseQuote(id, quoteId);
  refresh(id);
}

export async function unchooseLine(id: number, lineId: number) {
  await requireUser();
  await rfqs.unchooseLine(id, lineId);
  refresh(id);
}

export async function chooseSuggested(id: number): Promise<FormState> {
  return run(id, () => rfqs.chooseSuggested(id), "The suggested supplier is now chosen for each product.");
}

export async function makeOrders(id: number): Promise<FormState> {
  await requireUser();
  try {
    await rfqs.makeOrders(id);
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
