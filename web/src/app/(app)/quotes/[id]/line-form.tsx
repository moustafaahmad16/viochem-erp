"use client";

import Decimal from "decimal.js";
import { useState } from "react";
import { ActionForm, Field, Select, Submit, type FormState } from "@/components/forms";
import { useT } from "@/i18n/client";
import { money, pct } from "@/lib/format";
import type { PriceHint } from "@/lib/services/price-history";

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

const num = (s: string) => {
  try {
    const d = new Decimal(s.replace(/,/g, ""));
    return d.isFinite() && d.gt(0) ? d : null;
  } catch {
    return null;
  }
};

/** Past prices and costs for the chosen product, and how the typed price compares. */
function PricePanel({ hint, avgCost, price, unit, customer }: { hint: PriceHint; avgCost: string | null; price: string; unit: string; customer?: string }) {
  const t = useT();
  const p = num(price);
  const cost = hint.landed ? new Decimal(hint.landed) : avgCost ? new Decimal(avgCost) : null;
  const margin = p && cost ? p.minus(cost).div(p).times(100) : null;
  const usual = hint.usual ? new Decimal(hint.usual) : null;
  const under = p && usual ? usual.minus(p).div(usual).times(100) : null;
  const belowCost = p && cost && p.lt(cost);
  const wellUnder = !belowCost && under && under.gte(10);
  const d = (iso: string) => t.date(new Date(iso));

  return (
    <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm sm:col-span-6 sm:grid-cols-[1fr_1.15fr_1fr] sm:gap-5">
      <div>
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{customer ? t("Last sold to {customer}", { customer }) : t("Last sold to this customer")}</div>
        {hint.lastToCustomer.length === 0 ? (
          <p className="text-slate-500">{t("Never sold to this customer")}</p>
        ) : (
          <ul className="space-y-0.5">
            {hint.lastToCustomer.map((s) => (
              <li key={s.number} className="flex justify-between gap-2">
                <span className="text-slate-500">{d(s.date)}</span>
                <span className="num font-medium text-slate-900">EGP {money(s.price)}</span>
              </li>
            ))}
          </ul>
        )}
        {usual && <p className="mt-1 text-xs text-slate-500">{t("Average to all customers, last 6 months: EGP {price}", { price: money(usual) })}</p>}
      </div>
      <div>
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{t("What it cost")}</div>
        <ul className="space-y-0.5">
          {hint.lastPurchase && (
            <li className="flex justify-between gap-2">
              <span className="text-slate-500">{t("Last bought {date}", { date: d(hint.lastPurchase.date) })}</span>
              <span className="num text-slate-900" dir="ltr">{hint.lastPurchase.currency} {money(hint.lastPurchase.unitPrice)}</span>
            </li>
          )}
          {hint.landed && (
            <li className="flex justify-between gap-2">
              <span className="text-slate-500">{t("Landed cost / {unit}", { unit })}</span>
              <span className="num font-medium text-slate-900">EGP {money(hint.landed)}</span>
            </li>
          )}
          {avgCost && (
            <li className="flex justify-between gap-2">
              <span className="text-slate-500">{t("Average cost")}</span>
              <span className="num text-slate-900">EGP {money(avgCost)}</span>
            </li>
          )}
        </ul>
      </div>
      <div>
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{t("At the price you're typing")}</div>
        {!p ? (
          <p className="text-slate-500">{t("Type a price to see the margin.")}</p>
        ) : (
          <>
            <p className={`text-2xl font-semibold ${margin?.lt(0) ? "text-red-700" : margin?.lt(10) ? "text-amber-700" : "text-emerald-700"}`} dir="ltr">
              {margin ? pct(margin.toDecimalPlaces(1)) : "—"}
            </p>
            <p className="text-xs text-slate-500">{cost && t("margin over landed cost · EGP {amount} per {unit}", { amount: money(p.minus(cost)), unit })}</p>
          </>
        )}
        {belowCost && <p className="mt-2 rounded-md bg-red-100 px-2 py-1 font-medium text-red-800">{t("Below cost: you would lose EGP {amount} per {unit}.", { amount: money(cost!.minus(p!)), unit })}</p>}
        {wellUnder && <p className="mt-2 rounded-md bg-amber-100 px-2 py-1 font-medium text-amber-900">{t("{pct} under the usual price of EGP {price}.", { pct: pct(under!.toDecimalPlaces(0)), price: money(usual!) })}</p>}
      </div>
    </div>
  );
}
