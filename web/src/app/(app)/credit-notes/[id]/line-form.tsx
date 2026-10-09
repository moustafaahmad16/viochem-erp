"use client";

import { useState } from "react";
import { ActionForm, Field, Select, Submit, type FormState } from "@/components/forms";
import { useT } from "@/i18n/client";

type Option = { id: number; label: string; unit: string; price: string; remaining: string };

/** Credit part of one invoice line: how much, at what price, and whether the goods came back. */
export function CreditLineForm({ action, lines }: { action: (s: FormState, fd: FormData) => Promise<FormState>; lines: Option[] }) {
  const t = useT();
  const [lineId, setLineId] = useState("");
  const line = lines.find((l) => String(l.id) === lineId);

  return (
    <ActionForm action={action} className="grid gap-3 sm:grid-cols-6" resetOnSuccess>
      <Select
        label={t("Product on the invoice")}
        name="invoiceLineId"
        value={lineId}
        onChange={(e) => setLineId(e.target.value)}
        options={lines.map((l) => ({ value: l.id, label: l.label }))}
        placeholder={t("Choose…")}
        className="sm:col-span-6"
        required
      />
      <Field
        label={line ? t("Quantity ({unit})", { unit: line.unit }) : t("Quantity")}
        name="qty"
        inputMode="decimal"
        placeholder={line?.remaining}
        required
        className="sm:col-span-2"
      />
      <Field
        label={t("Price per unit (EGP, before VAT)")}
        name="unitPrice"
        inputMode="decimal"
        placeholder={line?.price}
        hint={t("Leave empty for the invoice price. Enter less to credit only part of the price.")}
        className="sm:col-span-4"
      />
      <label className="flex items-center gap-2 text-sm sm:col-span-4">
        <input type="checkbox" name="restock" defaultChecked /> {t("The goods came back: put them back in stock")}
      </label>
      <div className="flex items-end sm:col-span-2">
        <Submit variant="secondary">{t("Add to credit note")}</Submit>
      </div>
    </ActionForm>
  );
}
