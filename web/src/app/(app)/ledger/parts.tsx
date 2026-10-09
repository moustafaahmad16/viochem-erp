import type Decimal from "decimal.js";
import Link from "next/link";
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

export function DateFilter({ from, to, asOf }: { from?: Date; to?: Date; asOf?: Date }) {
  const input = "rounded-lg border border-slate-300 px-3 py-2";
  return (
    <form className="flex flex-wrap items-end gap-3 text-sm">
      {asOf ? (
        <label>
          <span className="mb-1 block text-slate-600">As of</span>
          <input type="date" name="asOf" defaultValue={toInputDate(asOf)} className={input} />
        </label>
      ) : (
        <>
          <label>
            <span className="mb-1 block text-slate-600">From</span>
            <input type="date" name="from" defaultValue={toInputDate(from)} className={input} />
          </label>
          <label>
            <span className="mb-1 block text-slate-600">To</span>
            <input type="date" name="to" defaultValue={toInputDate(to)} className={input} />
          </label>
        </>
      )}
      <button className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700">Show</button>
    </form>
  );
}

export function Warnings({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <div className="font-medium">Fix these so the books are complete</div>
      <ul className="mt-1 list-disc ps-5">
        {items.map((w) => <li key={w}>{w}</li>)}
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
