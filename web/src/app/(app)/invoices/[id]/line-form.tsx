"use client";

import { useState } from "react";
import { ActionForm, Field, Select, Submit, type FormState } from "@/components/forms";
import { useT } from "@/i18n/client";
import { PricePanel } from "@/components/price-panel";
import type { PriceHint } from "@/lib/services/price-history";

type Option = { id: number; code: string; name: string; unit: string; stock: string; avgCost?: string | null; hint?: PriceHint };
type LotOption = { id: number; itemId: number; label: string; cost?: string };

const label = (i: Option) => `${i.code} · ${i.name}`;

/**
 * Add a product to a draft invoice. Type its code (or part of its name) and pick it from the list;
 * the lot list follows the chosen product.
 */
export function LineForm({ action, items, lots, customer }: { action: (s: FormState, fd: FormData) => Promise<FormState>; items: Option[]; lots: LotOption[]; customer?: string }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [lotId, setLotId] = useState("");
  const [price, setPrice] = useState("");
  const typed = query.trim().toLowerCase();
  const item = items.find((i) => label(i) === query || i.code.toLowerCase() === typed);
  const itemLots = item ? lots.filter((l) => l.itemId === item.id) : [];
  const lot = itemLots.find((l) => String(l.id) === lotId);

  return (
    <ActionForm action={action} className="grid gap-3 sm:grid-cols-6" resetOnSuccess onSuccess={() => { setQuery(""); setLotId(""); setPrice(""); }}>
      <div className="sm:col-span-3">
        <Field
          label={t("Product code or name")}
          name="product"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          list="invoice-products"
          autoComplete="off"
          dir="ltr"
          required
          hint={item ? `${item.name} · ${item.stock}` : typed ? t("No product with that code. Pick one from the list.") : undefined}
        />
        <datalist id="invoice-products">
          {items.map((i) => (
            <option key={i.id} value={label(i)} label={i.stock} />
          ))}
        </datalist>
        <input type="hidden" name="itemId" value={item?.id ?? ""} />
      </div>
      <Select
        label={t("Batch")}
        name="lotId"
        options={itemLots.map((l) => ({ value: l.id, label: l.label }))}
        placeholder={t("Earliest expiry first")}
        className="sm:col-span-3"
        value={lot ? lotId : ""}
        onChange={(e) => setLotId(e.target.value)}
      />
      {item?.hint && <PricePanel hint={item.hint} avgCost={item.avgCost ?? null} price={price} unit={t(item.unit)} customer={customer} batchCost={lot?.cost} />}
      <Field label={item ? t("Quantity ({unit})", { unit: item.unit }) : t("Quantity")} name="qty" inputMode="decimal" required className="sm:col-span-2" />
      <Field label={t("Price per unit (EGP, before VAT)")} name="unitPrice" inputMode="decimal" required className="sm:col-span-2" value={price} onChange={(e) => setPrice(e.target.value)} />
      <div className="flex items-end sm:col-span-2">
        <Submit variant="secondary">{t("Add to invoice")}</Submit>
      </div>
    </ActionForm>
  );
}
