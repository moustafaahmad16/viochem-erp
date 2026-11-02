"use client";

import { useRef, useState } from "react";
import { Select, type FormState } from "@/components/forms";
import { buttonClass } from "@/components/ui";
import { useT } from "@/i18n/client";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Upload a supplier's reply sheet. When the upload failed (the file moved or was still being saved,
 * or the main computer couldn't be reached) nothing used to happen and the button looked stuck. Every
 * way it can fail now says what to do, the button can't be pressed twice while it works, and the same
 * file can be chosen again straight away.
 */
export function ReplyUpload({ action, suppliers }: { action: (state: FormState, fd: FormData) => Promise<FormState>; suppliers: { id: number; name: string }[] }) {
  const t = useT();
  const [state, setState] = useState<FormState>();
  const [pending, setPending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Clearing the box lets the same file be chosen again after it was fixed in Excel.
  const clearFile = () => {
    if (fileRef.current) fileRef.current.value = "";
  };

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    const picked = fd.get("file");
    if (!(picked instanceof File) || !picked.name) return setState({ error: "Choose an Excel file first." });
    if (!/\.xlsx$/i.test(picked.name)) {
      clearFile();
      return setState({ error: "Only .xlsx files can be read. In Excel, choose Save As and pick Excel Workbook (.xlsx)." });
    }
    if (picked.size === 0) {
      clearFile();
      return setState({ error: "That file couldn't be read, or it's empty. Close it in Excel, then choose it again." });
    }
    if (picked.size > MAX_BYTES) {
      clearFile();
      return setState({ error: "That file is over 5 MB. Split it into smaller files." });
    }

    setPending(true);
    setState(undefined);
    try {
      const result = await action(undefined, fd);
      setState(result);
      if (result?.ok) form.reset();
    } catch {
      // The file couldn't be sent (moved, still being saved, locked) or VIOCHEM couldn't be reached.
      clearFile();
      setState({ error: "The upload didn't go through. If the file is open in Excel, close it and choose it again. Check that VIOCHEM is still open on the main computer, then try again." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {state?.error && <div role="alert" className="mb-4 whitespace-pre-line rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{t.message(state.error)}</div>}
      {state?.ok && <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{t.message(state.ok)}</div>}
      <div className="space-y-4">
        <input
          ref={fileRef}
          type="file"
          name="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
          disabled={pending}
          aria-label={t("Reply sheet")}
          onChange={() => setState(undefined)}
          className="block w-full text-sm text-slate-600 file:me-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-800 hover:file:bg-slate-200"
        />
        <Select label={t("From")} name="supplierId" options={suppliers.map((s) => ({ value: s.id, label: s.name }))} placeholder={t("The name written on the sheet")} />
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? t("Reading the sheet…") : t("Upload reply")}
        </button>
      </div>
    </form>
  );
}
