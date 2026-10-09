"use client";

import Decimal from "decimal.js";
import { useState } from "react";

type Option = { value: string; label: string; group?: string };
type Line = { key: number; debit: string; credit: string };

const parse = (v: string) => {
  try {
    return new Decimal(v.replace(/,/g, "") || 0);
  } catch {
    return new Decimal(0);
  }
};

/** The lines of a journal entry, with running totals so it is clear when it balances. */
export function JournalLines({ accounts }: { accounts: Option[] }) {
  const [lines, setLines] = useState<Line[]>([0, 1].map((key) => ({ key, debit: "", credit: "" })));
  const set = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const debit = lines.reduce((s, l) => s.plus(parse(l.debit)), new Decimal(0));
  const credit = lines.reduce((s, l) => s.plus(parse(l.credit)), new Decimal(0));
  const diff = debit.minus(credit);
  const groups = [...new Set(accounts.map((a) => a.group))];
  const input = "w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm";

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="text-start text-xs uppercase tracking-wide text-slate-500">
            <th className="pb-2 font-medium">Account</th>
            <th className="w-32 pb-2 pe-4 text-end font-medium">Debit</th>
            <th className="w-32 pb-2 pe-4 text-end font-medium">Credit</th>
            <th className="pb-2 ps-1 font-medium">Line note</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.key}>
              <td className="py-1 pe-2">
                <select name="account" defaultValue="" className={input} aria-label="Account">
                  <option value="">Choose</option>
                  {groups.map((g) => (
                    <optgroup key={g} label={g}>
                      {accounts.filter((a) => a.group === g).map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                    </optgroup>
                  ))}
                </select>
              </td>
              <td className="py-1 pe-2"><input name="debit" inputMode="decimal" value={l.debit} onChange={(e) => set(l.key, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} className={`${input} text-end`} aria-label="Debit" /></td>
              <td className="py-1 pe-2"><input name="credit" inputMode="decimal" value={l.credit} onChange={(e) => set(l.key, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} className={`${input} text-end`} aria-label="Credit" /></td>
              <td className="py-1 pe-2"><input name="lineMemo" className={input} aria-label="Line note" /></td>
              <td className="py-1">
                {lines.length > 2 && (
                  <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="text-slate-400 hover:text-red-600" aria-label="Remove line">×</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-200 font-medium">
            <td className="pt-2">
              <button type="button" onClick={() => setLines((ls) => [...ls, { key: Math.max(...ls.map((x) => x.key)) + 1, debit: "", credit: diff.gt(0) ? diff.toFixed(2) : "" }])} className="text-sm font-medium text-brand-700 hover:underline">
                + Add a line
              </button>
            </td>
            <td className="num pt-2">{debit.toFixed(2)}</td>
            <td className="num pt-2">{credit.toFixed(2)}</td>
            <td colSpan={2} className={`pt-2 ps-2 text-sm ${diff.isZero() ? "text-emerald-700" : "text-amber-700"}`}>
              {diff.isZero() ? (debit.isZero() ? "" : "Balanced") : `Off by ${diff.abs().toFixed(2)}`}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
