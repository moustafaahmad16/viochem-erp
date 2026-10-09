"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/forms";
import { date, fail, required, text } from "@/lib/actions";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { UserError } from "@/lib/services/errors";
import { SECTIONS } from "@/lib/services/gl";
import { createJournal, deleteJournal } from "@/lib/services/journal";
import type { LedgerSection } from "@prisma/client";

export async function addLedgerAccount(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  try {
    const code = required(fd, "code", "Code");
    if (!/^\d{4}$/.test(code)) throw new UserError("Codes are four digits, like 6230.");
    const section = required(fd, "section", "Section") as LedgerSection;
    if (!(section in SECTIONS)) throw new UserError("Choose a section.");
    await db.ledgerAccount.create({ data: { code, name: required(fd, "name", "Name"), section } });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/ledger");
  return { ok: "Account added." };
}

export async function renameLedgerAccount(id: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  try {
    await db.ledgerAccount.update({ where: { id }, data: { name: required(fd, "name", "Name"), active: fd.get("active") === "on" } });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/ledger", "layout");
  return { ok: "Saved." };
}

export async function addJournal(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireAdmin();
  let id: number;
  try {
    const accounts = fd.getAll("account").map(String);
    const debits = fd.getAll("debit").map((v) => String(v).replace(/,/g, "").trim());
    const credits = fd.getAll("credit").map((v) => String(v).replace(/,/g, "").trim());
    const memos = fd.getAll("lineMemo").map((v) => String(v).trim() || null);
    for (const v of [...debits, ...credits]) if (v && Number.isNaN(Number(v))) throw new UserError(`"${v}" isn't a number.`);
    const lines = accounts.map((account, i) => ({ account, debit: debits[i], credit: credits[i], memo: memos[i] })).filter((l) => l.account || l.debit || l.credit);
    ({ id } = await createJournal({ date: date(fd, "date", "Date"), memo: text(fd, "memo") ?? "", createdBy: user.name, lines }));
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/ledger", "layout");
  redirect(`/ledger/journal/${id}`);
}

export async function removeJournal(id: number) {
  await requireAdmin();
  await deleteJournal(id);
  revalidatePath("/ledger", "layout");
  redirect("/ledger/journal");
}
