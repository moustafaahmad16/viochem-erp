"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";

export type PickItem = { id: number; code: string; name: string; cas: string | null; unit: string };
type Row = { key: number; itemId: string; qty: string };

/** The products to ask about: pick each one, see its CAS number, type the quantity. */
export function ProductRows({ items, initial }: { items: PickItem[]; initial: { itemId: number; qty: string }[] }) {
  const t = useT();
  const [rows, setRows] = useState<Row[]>(() => {
    const start = initial.map((r, i) => ({ key: i, itemId: String(r.itemId), qty: r.qty }));
    return start.length ? start : [{ key: 0, itemId: "", qty: "" }];
  });
  const [next, setNext] = useState(rows.length);
  const byId = new Map(items.map((i) => [String(i.id), i]));
  const set = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const input = "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500 [&_th]:px-4 [&_th]:py-2.5 [&_th]:text-start [&_th]:font-medium">
          <tr>
            <th className="w-1/2">{t("Product")}</th>
            <th>{t("CAS")}</th>
            <th>{t("Quantity")}</th>
            <th />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 [&_td]:px-4 [&_td]:py-2">
          {rows.map((r, i) => {
            const item = byId.get(r.itemId);
            return (
              <tr key={r.key}>
                <td>
                  <select name={`item_${i}`} value={r.itemId} onChange={(e) => set(r.key, { itemId: e.target.value })} aria-label={t("Product")} className={input}>
                    <option value="">{t("Choose…")}</option>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.name}{it.cas ? ` · CAS ${it.cas}` : ""} ({it.code})
                      </option>
                    ))}
                  </select>
                </td>
                <td className="whitespace-nowrap font-mono text-xs text-slate-600">{item?.cas ?? ""}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <input name={`qty_${i}`} value={r.qty} onChange={(e) => set(r.key, { qty: e.target.value })} inputMode="decimal" aria-label={t("Quantity")} className={`${input} w-28 text-end`} />
                    <span className="text-xs text-slate-500">{item ? t(item.unit) : ""}</span>
                  </div>
                </td>
                <td className="text-end">
                  {rows.length > 1 && (
                    <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="text-xs text-slate-400 hover:text-red-600">
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
            setRows((rs) => [...rs, { key: next, itemId: "", qty: "" }]);
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
