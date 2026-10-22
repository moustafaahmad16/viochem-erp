"use client";

import { useEffect, useRef, useState } from "react";
import { ActionForm, Field, Select, Submit, type FormState } from "@/components/forms";
import { useT } from "@/i18n/client";

/** Upload form. "New type…" in the list shows a box to name a type that isn't there yet. */
export function DocumentUpload({ action, types }: { action: (state: FormState, fd: FormData) => Promise<FormState>; types: { id: number; name: string; builtIn: boolean }[] }) {
  const t = useT();
  const first = String(types[0]?.id ?? "new");
  const [choice, setChoice] = useState(first);
  // The form clears itself after an upload; follow it back to the first type.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const form = ref.current?.closest("form");
    const reset = () => setChoice(first);
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [first]);
  return (
    <ActionForm action={action} className="grid gap-3 sm:grid-cols-6" resetOnSuccess>
      <Select
        label={t("Document type")}
        name="typeId"
        defaultValue={first}
        onChange={(e) => setChoice(e.target.value)}
        options={[...types.map((ty) => ({ value: ty.id, label: ty.builtIn ? t(ty.name) : ty.name })), { value: "new", label: t("New type…") }]}
        className="sm:col-span-3"
      />
      {choice === "new" ? (
        <Field label={t("New type name")} name="newType" required maxLength={60} placeholder={t("e.g. {value}", { value: "Bill of Lading" })} className="sm:col-span-3" />
      ) : (
        <div className="hidden sm:col-span-3 sm:block" />
      )}
      <Field label={t("File")} name="file" type="file" required hint={t("PDF, photo or any other file, up to 15 MB.")} className="sm:col-span-4" />
      <div ref={ref} className="flex items-end sm:col-span-2">
        <Submit variant="secondary">{t("Upload")}</Submit>
      </div>
    </ActionForm>
  );
}
