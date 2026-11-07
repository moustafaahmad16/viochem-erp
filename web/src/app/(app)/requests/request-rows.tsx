"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";
import { normalizeCas } from "@/lib/chemistry";
import { ActionForm, Submit, type FormState } from "@/components/forms";

export type RequestItem = { id: number; code: string; name: string; cas: string | null; unit: string; free: string };
type Row = { key: number; itemId: string; qty: string; name: string; cas: string; unit: string };

const show = (v: string) => Number(v).toLocaleString("en-US", { maximumFractionDigits: 3 });
const blank = (key: number): Row => ({ key, itemId: "", qty: "", name: "", cas: "", unit: "kg" });

/**
 * The products a customer asked for. Each is one of ours, with what is free in stock shown as it is
 * picked, or "A product we don't import", typed in by name and CAS number.
 */
export function RequestRows({ items, start = 1 }: { items: RequestItem[]; start?: number }) {
  const t = useT();
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: start }, (_, i) => blank(i)));
  const [next, setNext] = useState(start);
  const byId = new Map(items.map((i) => [String(i.id), i]));
  const set = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const input = "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500 [&_th]:px-4 [&_th]:py-2.5 [&_th]:text-start [&_th]:font-medium">
          <tr>
            <th className="w-3/5">{t("Product")}</th>
            <th>{t("Quantity")}</th>
            <th />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 [&_td]:px-4 [&_td]:py-2 [&_td]:align-top">
          {rows.map((r, i) => {
            const item = byId.get(r.itemId);
            const other = r.itemId === "other";
            const wanted = Number(r.qty.replace(/,/g, ""));
            const free = item ? Number(item.free) : 0;
            return (
              <tr key={r.key}>
                <td className="space-y-2">
                  <select name={`item_${i}`} value={r.itemId} onChange={(e) => set(r.key, { itemId: e.target.value })} aria-label={t("Product")} className={input}>
                    <option value="">{t("Choose…")}</option>
                    <option value="other">{t("+ A product we don't import…")}</option>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.name}{it.cas ? ` · CAS ${it.cas}` : ""} ({it.code}) · {t("{qty} {unit} free", { qty: show(it.free), unit: t(it.unit) })}
                      </option>
                    ))}
                  </select>
                  {item && (
                    <p className={`text-xs ${free <= 0 ? "text-red-700" : wanted > free ? "text-amber-800" : "text-emerald-700"}`}>
                      {free <= 0
                        ? t("Out of stock. It will go to the supply gap.")
                        : wanted > free
                          ? t("Only {qty} {unit} free. The rest will go to the supply gap.", { qty: show(item.free), unit: t(item.unit) })
                          : t("{qty} {unit} free in stock.", { qty: show(item.free), unit: t(item.unit) })}
                    </p>
                  )}
                  {other && (
                    <div className="grid gap-2 sm:grid-cols-3">
                      <input name={`name_${i}`} value={r.name} onChange={(e) => set(r.key, { name: e.target.value })} placeholder={t("Product name")} aria-label={t("Product name")} className={`${input} sm:col-span-2`} />
                      <input
                        name={`cas_${i}`}
                        value={r.cas}
                        onChange={(e) => set(r.key, { cas: e.target.value })}
                        onBlur={(e) => e.target.value.trim() && set(r.key, { cas: normalizeCas(e.target.value) })}
                        placeholder={t("CAS (optional)")}
                        aria-label={t("CAS")}
                        dir="ltr"
                        className={input}
                      />
                    </div>
                  )}
                  {other && <p className="text-xs text-slate-500">{t("Recorded in the supply gap under products we don't import.")}</p>}
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <input name={`qty_${i}`} value={r.qty} onChange={(e) => set(r.key, { qty: e.target.value })} inputMode="decimal" aria-label={t("Quantity")} className={`${input} w-28 text-end`} />
                    {other ? (
                      <select name={`unit_${i}`} value={r.unit} onChange={(e) => set(r.key, { unit: e.target.value })} aria-label={t("Unit")} className={`${input} w-20`}>
                        {["kg", "L", "g", "pcs"].map((u) => <option key={u} value={u}>{t(u)}</option>)}
                      </select>
                    ) : (
                      <span className="text-xs text-slate-500">{item ? t(item.unit) : ""}</span>
                    )}
                  </div>
                </td>
                <td className="text-end">
                  {rows.length > 1 && (
                    <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="pt-2 text-xs text-slate-400 hover:text-red-600">
                      {t("Remove")}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="px-4 py-3">
        <button
          type="button"
          onClick={() => {
            setRows((rs) => [...rs, blank(next)]);
            setNext(next + 1);
          }}
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          + {t("Add product")}
        </button>
      </div>
    </div>
  );
}

/** Add more products to an open request. The rows empty once they are saved. */
export function AddLinesForm({ action, items }: { action: (s: FormState, fd: FormData) => Promise<FormState>; items: RequestItem[] }) {
  const t = useT();
  const [round, setRound] = useState(0);
  return (
    <ActionForm action={action} onSuccess={() => setRound((n) => n + 1)} className="space-y-0">
      <RequestRows key={round} items={items} />
      <div className="px-4 pb-4">
        <Submit variant="secondary">{t("Add to request")}</Submit>
      </div>
    </ActionForm>
  );
}
