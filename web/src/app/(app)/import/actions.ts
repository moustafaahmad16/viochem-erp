"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/forms";
import { requireUser } from "@/lib/auth";
import { readRows } from "@/lib/import/excel";
import { KINDS, type KindName } from "@/lib/import/kinds";
import { importRows } from "@/lib/services/importer";

const MAX_BYTES = 5 * 1024 * 1024;

export async function importFile(kind: KindName, _: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  if (!(kind in KINDS)) return { error: "Unknown import." };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an Excel file first." };
  if (file.size > MAX_BYTES) return { error: "That file is over 5 MB. Split it into smaller files." };

  try {
    const result = await importRows(kind, await readRows(await file.arrayBuffer()));
    if (result.errors.length) {
      const shown = result.errors.slice(0, 25).map((e) => `Row ${e.row}: ${e.message}`);
      const more = result.errors.length > 25 ? `\n…and ${result.errors.length - 25} more.` : "";
      return { error: `Nothing was imported. Fix ${result.errors.length === 1 ? "this problem" : `these ${result.errors.length} problems`} and upload again:\n${shown.join("\n")}${more}` };
    }
    revalidatePath("/", "layout");
    const parts = [result.created && `${result.created} added`, result.updated && `${result.updated} updated`].filter(Boolean);
    return { ok: `Done: ${parts.join(", ")}.` };
  } catch (e) {
    console.error(e);
    return { error: e instanceof Error && /couldn't be opened/.test(e.message) ? e.message : "Something went wrong. Please try again." };
  }
}
