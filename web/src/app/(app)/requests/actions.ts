"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/forms";
import { date, decimal, fail, int, text } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { UserError } from "@/lib/services/errors";
import * as svc from "@/lib/services/requests";
import type { InvoiceKind } from "@prisma/client";

const path = (id: number) => `/requests/${id}`;

function refresh(id?: number) {
  if (id) revalidatePath(path(id));
  revalidatePath("/requests");
  revalidatePath("/supply-gap");
}

/**
 * The product rows of the form: item_0/qty_0… with name_0/cas_0/unit_0 when item_0 is "other",
 * a product we don't import. Empty rows are skipped.
 */
function productRows(fd: FormData): svc.RequestLineInput[] {
  const lines: svc.RequestLineInput[] = [];
  for (let i = 0; fd.has(`item_${i}`); i++) {
    const item = text(fd, `item_${i}`);
    const qty = text(fd, `qty_${i}`)?.replace(/,/g, "");
    const name = text(fd, `name_${i}`);
    const cas = text(fd, `cas_${i}`);
    if (!item && !qty) continue;
    if (!item) throw new UserError("Choose the product on every line, or remove the empty line.");
    if (!qty || !(Number(qty) > 0)) throw new UserError("Enter a quantity for every product.");
    if (item === "other") {
      if (!name && !cas) throw new UserError("Type the name of each product we don't import.");
      lines.push({ itemId: null, productName: name, casNumber: cas, unit: text(fd, `unit_${i}`), qty });
    } else {
      lines.push({ itemId: Number(item), productName: null, casNumber: null, unit: null, qty });
    }
  }
  return lines;
}

export async function createRequest(_: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  let id: number;
  try {
    const lines = productRows(fd);
    if (!lines.length) throw new UserError("Add at least one product.");
    id = (await svc.createRequest(int(fd, "customerId", "Customer"), date(fd, "date", "Date"), lines, text(fd, "notes"))).id;
  } catch (e) {
    return fail(e);
  }
  refresh();
  redirect(path(id));
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

export async function updateRequest(id: number, _: FormState, fd: FormData): Promise<FormState> {
  return run(id, async () => svc.updateRequest(id, { customerId: int(fd, "customerId", "Customer"), date: date(fd, "date", "Date"), notes: text(fd, "notes") }), "Saved.");
}

export async function addLines(id: number, _: FormState, fd: FormData): Promise<FormState> {
  return run(id, async () => svc.addRequestLines(id, productRows(fd)), "Product added.");
}

export async function updateLine(id: number, lineId: number, _: FormState, fd: FormData): Promise<FormState> {
  return run(id, async () => svc.updateRequestLine(id, lineId, decimal(fd, "qty", "Quantity")), "Saved.");
}

export async function removeLine(id: number, lineId: number) {
  await requireUser();
  await svc.removeRequestLine(id, lineId);
  refresh(id);
}

export async function cancelRequest(id: number): Promise<FormState> {
  return run(id, () => svc.cancelRequest(id), "Cancelled.");
}

export async function reopenRequest(id: number): Promise<FormState> {
  return run(id, () => svc.reopenRequest(id), "Reopened.");
}

export async function deleteRequest(id: number): Promise<FormState> {
  await requireUser();
  try {
    await svc.deleteRequest(id);
  } catch (e) {
    return fail(e);
  }
  refresh();
  redirect("/requests");
}

export async function convertRequest(id: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  const kind: InvoiceKind = fd.get("kind") === "NON_TAXED" ? "NON_TAXED" : "TAXED";
  let quoteId: number | null;
  try {
    quoteId = (await svc.convertRequest(id, kind)).quoteId;
  } catch (e) {
    return fail(e);
  }
  refresh(id);
  revalidatePath("/quotes");
  if (quoteId) redirect(`/quotes/${quoteId}`);
  return { ok: "Nothing was free in stock, so no quotation was made. Everything went to the supply gap." };
}

/** Mark one product's missing quantity as dealt with, or bring it back. */
export async function setHandled(lineIds: number[], handled: boolean) {
  await requireUser();
  await svc.setGapHandled(lineIds, handled);
  revalidatePath("/supply-gap");
}
