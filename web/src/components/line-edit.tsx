"use client";

import { startTransition, useActionState } from "react";
import type { FormState } from "./forms";
import { useT } from "@/i18n/client";

/**
 * Change a line's quantity and price in place. The inputs sit in the table's own cells and point at
 * this form with their form attribute, since a form can't wrap a table row.
 */
export function LineSave({ id, action }: { id: string; action: (s: FormState, fd: FormData) => Promise<FormState> }) {
  const [state, run, pending] = useActionState(action, undefined);
  const t = useT();
  return (
    <form
      id={id}
      action={run}
      onSubmit={(e) => {
        // Submitting by hand keeps what was typed when the action fails.
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => run(fd));
      }}
      className="inline"
    >
      <button disabled={pending} className="text-xs font-medium text-brand-700 hover:underline disabled:opacity-50">{pending ? t("Saving…") : t("Save")}</button>
      {state?.error && <span role="alert" className="block whitespace-pre-line text-xs text-red-700">{t.message(state.error)}</span>}
    </form>
  );
}

/** A number input in a table cell, belonging to a LineSave form. */
export function LineInput({ form, name, defaultValue, label }: { form: string; name: string; defaultValue: string; label: string }) {
  return (
    <input
      form={form}
      name={name}
      defaultValue={defaultValue}
      aria-label={label}
      inputMode="decimal"
      dir="ltr"
      required
      className="w-24 rounded-md border border-slate-300 px-2 py-1 text-end text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
    />
  );
}
