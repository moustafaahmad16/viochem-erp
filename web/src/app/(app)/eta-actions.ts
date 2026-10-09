"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/forms";
import { fail } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { sendCreditNote, sendInvoice, textToSign, type BrowserSignature, type EtaKind } from "@/lib/services/einvoice";

/** The text the e-seal signer in the browser must sign, or why the document can't be sent yet. */
export async function etaTextToSign(kind: EtaKind, id: number): Promise<{ serialized: string; number: string } | { error: string }> {
  await requireUser();
  try {
    return await textToSign(kind, id);
  } catch (e) {
    return { error: fail(e)?.error ?? "Something went wrong. Please try again." };
  }
}

/** Send an invoice or credit note to ETA, with the signature made in the browser when there is one. */
export async function etaSend(kind: EtaKind, id: number, signed: BrowserSignature | null): Promise<FormState> {
  await requireUser();
  let status;
  try {
    status = (kind === "invoice" ? await sendInvoice(id, signed ?? undefined) : await sendCreditNote(id, signed ?? undefined)).etaStatus;
  } catch (e) {
    return fail(e);
  }
  revalidatePath(kind === "invoice" ? `/invoices/${id}` : `/credit-notes/${id}`);
  return status === "SUBMITTED" ? { ok: "Sent. The tax authority is checking it; check again in a minute." } : { error: "The tax authority refused it. The reasons are shown above." };
}
