import type Decimal from "decimal.js";
import Link from "next/link";
import type { T } from "@/i18n/core";
import { getT } from "@/i18n/server";
import { parseInputDate, toInputDate } from "@/lib/dates";
import { money } from "@/lib/format";

/** A date from the address bar, or the fallback when it is missing or not a date. */
export function dateParam(v: unknown, fallback: Date) {
  try {
    return parseInputDate(typeof v === "string" ? v : "") ?? fallback;
  } catch {
    return fallback;
  }
}

/** Accountants' style: negatives in brackets, zero as a dash. */
export function Amount({ v, strong = false, className = "" }: { v: Decimal; strong?: boolean; className?: string }) {
  return (
    <td className={`num ${strong ? "font-semibold" : ""} ${v.lt(0) ? "text-red-700" : ""} ${className}`}>
      {v.isZero() ? "–" : v.lt(0) ? `(${money(v.neg())})` : money(v)}
    </td>
  );
}

export async function DateFilter({ from, to, asOf }: { from?: Date; to?: Date; asOf?: Date }) {
  const t = await getT();
  const input = "rounded-lg border border-slate-300 px-3 py-2";
  return (
    <form className="flex flex-wrap items-end gap-3 text-sm">
      {asOf ? (
        <label>
          <span className="mb-1 block text-slate-600">{t("As of")}</span>
          <input type="date" name="asOf" defaultValue={toInputDate(asOf)} className={input} />
        </label>
      ) : (
        <>
          <label>
            <span className="mb-1 block text-slate-600">{t("From")}</span>
            <input type="date" name="from" defaultValue={toInputDate(from)} className={input} />
          </label>
          <label>
            <span className="mb-1 block text-slate-600">{t("To")}</span>
            <input type="date" name="to" defaultValue={toInputDate(to)} className={input} />
          </label>
        </>
      )}
      <button className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700">{t("Show")}</button>
    </form>
  );
}

export async function Warnings({ items }: { items: string[] }) {
  if (!items.length) return null;
  const t = await getT();
  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <div className="font-medium">{t("Fix these so the books are complete")}</div>
      <ul className="mt-1 list-disc ps-5">
        {items.map((w) => <li key={w}>{t.message(w)}</li>)}
      </ul>
    </div>
  );
}

export const LEDGER_LINKS = [
  { href: "/ledger", label: "Chart of accounts" },
  { href: "/ledger/journal", label: "Journal" },
  { href: "/ledger/trial-balance", label: "Trial balance" },
  { href: "/ledger/balance-sheet", label: "Balance sheet" },
  { href: "/reports/profit", label: "Profit and loss" },
];

export function AccountLink({ code, children }: { code: string; children: React.ReactNode }) {
  return <Link href={`/ledger/${code}`} className="hover:text-brand-700 hover:underline">{children}</Link>;
}

/**
 * Memos and details the books build in English, like "Goods from Givaudan · USD 1200.00 at 48.5",
 * in the chosen language. Names in them stay as they are; English is shown untouched.
 */
export function memoText(t: T, text: string | null | undefined, { transfer = false } = {}): string {
  if (!text) return "";
  if (t.lang === "en") return text;
  return text
    .split(" · ")
    .map((part, i) => {
      let m: RegExpExecArray | null;
      if (transfer && i === 0 && (m = /^(.+) to (.+)$/.exec(part))) return t("Transfer from {from} to {to}", { from: m[1], to: m[2] });
      if ((m = /^Goods from (.+)$/.exec(part))) return t("Goods from {supplier}", { supplier: m[1] });
      if ((m = /^From (.+)$/.exec(part))) return t("Money from {name}", { name: m[1] });
      if ((m = /^To (.+)$/.exec(part))) return t("Money to {name}", { name: m[1] });
      if ((m = /^For (.+)$/.exec(part))) return t("For shipment {ref}", { ref: m[1] });
      if ((m = /^([A-Z]{3}) (-?[\d.]+) at ([\d.]+)$/.exec(part))) return t("Foreign amount {currency} {amount} at {rate}", { currency: m[1], amount: m[2], rate: m[3] });
      return t(part);
    })
    .join(" · ");
}

/** "1210 Customers" with the name in the chosen language. */
export const codedName = (t: T, label: string) => {
  const i = label.indexOf(" ");
  return i < 0 ? label : `${label.slice(0, i)} ${t(label.slice(i + 1))}`;
};
