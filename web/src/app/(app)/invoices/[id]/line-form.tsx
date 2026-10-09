"use client";

import { useState } from "react";
import { ActionForm, Field, Select, Submit, type FormState } from "@/components/forms";
import { useT } from "@/i18n/client";

type Option = { id: number; label: string; unit: string };
type LotOption = { id: number; itemId: number; label: string };

/** Add a product to a draft invoice; the lot list follows the chosen product. */
export function LineForm({ action, items, lots }: { action: (s: FormState, fd: FormData) => Promise<FormState>; items: Option[]; lots: LotOption[] }) {
  const t = useT();
  const [itemId, setItemId] = useState("");
  const item = items.find((i) => String(i.id) === itemId);
  const itemLots = lots.filter((l) => String(l.itemId) === itemId);

  return (
    <ActionForm action={action} className="grid gap-3 sm:grid-cols-6" resetOnSuccess>
      <Select
        label={t("Product")}
        name="itemId"
        value={itemId}
        onChange={(e) => setItemId(e.target.value)}
        options={items.map((i) => ({ value: i.id, label: i.label }))}
        placeholder={t("Choose…")}
        className="sm:col-span-3"
        required
      />
      <Select
        label={t("Lot")}
        name="lotId"
        options={itemLots.map((l) => ({ value: l.id, label: l.label }))}
        placeholder={t("Earliest expiry first")}
        className="sm:col-span-3"
      />
      <Field label={item ? t("Quantity ({unit})", { unit: item.unit }) : t("Quantity")} name="qty" inputMode="decimal" required className="sm:col-span-2" />
      <Field label={t("Price per unit (EGP, before VAT)")} name="unitPrice" inputMode="decimal" required className="sm:col-span-2" />
      <div className="flex items-end sm:col-span-2">
        <Submit variant="secondary">{t("Add to invoice")}</Submit>
      </div>
    </ActionForm>
  );
}
