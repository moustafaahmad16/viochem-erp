import Decimal from "decimal.js";
import Link from "next/link";
import { Card, PageHeader, Table } from "@/components/ui";
import { addDays, formatDate, parseInputDate, toInputDate, today } from "@/lib/dates";
import { money, pct } from "@/lib/format";
import { generalLedger } from "@/lib/services/gl";
import { months, profitAndLoss } from "@/lib/services/profit";

export const metadata = { title: "Profit and loss" };

function safeDate(v: unknown, fallback: Date) {
  try {
    return parseInputDate(typeof v === "string" ? v : "") ?? fallback;
  } catch {
    return fallback;
  }
}

const Amount = ({ v, strong = false }: { v: Decimal; strong?: boolean }) => (
  <td className={`num ${strong ? "font-semibold" : ""} ${v.lt(0) ? "text-red-700" : ""}`}>{v.lt(0) ? `(${money(v.neg())})` : money(v)}</td>
);

type PL = ReturnType<typeof profitAndLoss>;
type Part = "revenue" | "costOfSales" | "selling" | "admin" | "otherIncome" | "finance" | "incomeTax";
const lineOf = (p: PL, part: Part, code: string) => p[part].lines.find((l) => l.account.code === code)?.amount ?? new Decimal(0);

export default async function ProfitPage({ searchParams }: PageProps<"/reports/profit">) {
  const sp = await searchParams;
  const now = today();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const from = safeDate(sp.from, new Date(Date.UTC(y, 0, 1)));
  const to = safeDate(sp.to, now);
  const allMonths = months(from, to);
  const gl = await generalLedger();
  const total = profitAndLoss(gl, from, to);
  const byMonth = allMonths.length > 1 ? allMonths.map((p) => profitAndLoss(gl, p.from, p.to)) : [];
  // Leave out the empty months before anything happened.
  const first = byMonth.findIndex((p) => [p.revenue, p.costOfSales, p.selling, p.admin, p.finance, p.otherIncome].some((x) => x.lines.length));
  const cols = first < 0 ? [] : byMonth.slice(first);
  const periods = first < 0 ? [] : allMonths.slice(first);
  const quick = [
    { label: "This month", from: new Date(Date.UTC(y, m, 1)), to: now },
    { label: "Last month", from: new Date(Date.UTC(y, m - 1, 1)), to: addDays(new Date(Date.UTC(y, m, 1)), -1) },
    { label: "This year", from: new Date(Date.UTC(y, 0, 1)), to: now },
    { label: "Last year", from: new Date(Date.UTC(y - 1, 0, 1)), to: new Date(Date.UTC(y - 1, 11, 31)) },
  ];

  const row = (label: string, get: (p: typeof total) => Decimal, { strong = false, indent = false } = {}) => (
    <tr key={label} className={strong ? "bg-brand-50/60" : ""}>
      <td className={`whitespace-nowrap ${strong ? "font-semibold text-brand-900" : ""} ${indent ? "ps-8 text-slate-600" : ""}`}>{label}</td>
      {cols.map((c, i) => <Amount key={i} v={get(c)} strong={strong} />)}
      <Amount v={get(total)} strong />
    </tr>
  );

  /** A section's accounts, then its total. A single-account section shows just the total under the section's name. */
  const section = (label: string, part: Part, cost = false) => {
    const sign = (v: Decimal) => (cost ? v.neg() : v);
    const lines = total[part].lines;
    if (lines.length <= 1) return row(label, (p) => sign(p[part].total));
    return [
      ...lines.map((l) => row(`${l.account.code} ${l.account.name}`, (p) => sign(lineOf(p, part, l.account.code)), { indent: true })),
      row(label, (p) => sign(p[part].total)),
    ];
  };

  return (
    <>
      <PageHeader title="Profit and loss" subtitle={`${formatDate(from)} to ${formatDate(to)} · EGP · from the general ledger`} />
      <Card className="mb-4">
        <form className="flex flex-wrap items-end gap-3 text-sm">
          <label>
            <span className="mb-1 block text-slate-600">From</span>
            <input type="date" name="from" defaultValue={toInputDate(from)} className="rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label>
            <span className="mb-1 block text-slate-600">To</span>
            <input type="date" name="to" defaultValue={toInputDate(to)} className="rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <button className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700">Show</button>
          <span className="ms-auto flex gap-3">
            {quick.map((q) => (
              <Link key={q.label} href={`?from=${toInputDate(q.from)}&to=${toInputDate(q.to)}`} className="text-brand-700 hover:underline">{q.label}</Link>
            ))}
          </span>
        </form>
      </Card>
      <Card padded={false}>
        <Table head={<tr><th /> {cols.map((_, i) => <th key={i} className="num">{periods[i].label}</th>)}<th className="num">Total</th></tr>}>
          {section("Sales (before VAT)", "revenue")}
          {section("Cost of sales", "costOfSales", true)}
          {row("Gross profit", (p) => p.grossProfit, { strong: true })}
          {section("Selling and distribution expenses", "selling", true)}
          {section("General and administrative expenses", "admin", true)}
          {total.otherIncome.lines.length > 0 && section("Other income", "otherIncome")}
          {row("Operating profit", (p) => p.operatingProfit, { strong: true })}
          {section("Finance costs", "finance", true)}
          {row("Profit before tax", (p) => p.profitBeforeTax, { strong: true })}
          {total.incomeTax.lines.length > 0 && [section("Income tax", "incomeTax", true), row("Profit after tax", (p) => p.netProfit, { strong: true })]}
          <tr>
            <td className="text-slate-500">Net margin</td>
            {cols.map((c, i) => <td key={i} className="num text-slate-500">{pct(c.netMargin)}</td>)}
            <td className="num text-slate-500">{pct(total.netMargin)}</td>
          </tr>
        </Table>
      </Card>
      <p className="mt-3 text-xs text-slate-500">
        Freight, duty and clearance are inside the cost of goods, counted when the goods are sold. Exchange differences on foreign payments are in finance costs, and a negative amount there is a gain.
      </p>
    </>
  );
}
