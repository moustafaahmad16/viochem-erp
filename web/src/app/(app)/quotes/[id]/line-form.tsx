"use client";

import { useState } from "react";
import { ActionForm, Field, Select, Submit, type FormState } from "@/components/forms";
import { useT } from "@/i18n/client";
import type { PriceHint } from "@/lib/services/price-history";
import { PricePanel } from "@/components/price-panel";

type Option = { id: number; label: string; unit: string; avgCost: string | null; hint?: PriceHint };

/** Add a product to an open quotation. */
export function QuoteLineForm({ action, items, customer }: { action: (s: FormState, fd: FormData) => Promise<FormState>; items: Option[]; customer?: string }) {
  const t = useT();
  const [itemId, setItemId] = useState("");
  const [price, setPrice] = useState("");
  const item = items.find((i) => String(i.id) === itemId);

  return (
    <ActionForm action={action} className="grid gap-3 sm:grid-cols-6" resetOnSuccess>
      <Select
        label={t("Product")}
        name="itemId"
        value={itemId}
        onChange={(e) => setItemId(e.target.value)}
        options={items.map((i) => ({ value: i.id, label: i.label }))}
        placeholder={t("Choose…")}
        className="sm:col-span-6"
        required
      />
      {item?.hint && <PricePanel hint={item.hint} avgCost={item.avgCost} price={price} unit={t(item.unit)} customer={customer} />}
      <Field label={item ? t("Quantity ({unit})", { unit: item.unit }) : t("Quantity")} name="qty" inputMode="decimal" required className="sm:col-span-2" />
      <Field label={t("Price per unit (EGP, before VAT)")} name="unitPrice" inputMode="decimal" required className="sm:col-span-2" value={price} onChange={(e) => setPrice(e.target.value)} />
      <div className="flex items-end sm:col-span-2">
        <Submit variant="secondary">{t("Add to quotation")}</Submit>
      </div>
    </ActionForm>
  );
}
