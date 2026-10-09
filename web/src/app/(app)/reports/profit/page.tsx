import Decimal from "decimal.js";
import Link from "next/link";
import { Card, PageHeader, Table } from "@/components/ui";
import { addDays, formatDate, parseInputDate, toInputDate, today } from "@/lib/dates";
import { money, pct } from "@/lib/format";
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

export default async function ProfitPage({ searchParams }: PageProps<"/reports/profit">) {
  const sp = await searchParams;
  const now = today();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const from = safeDate(sp.from, new Date(Date.UTC(y, 0, 1)));
  const to = safeDate(sp.to, now);
  const allMonths = months(from, to);
  const [total, ...byMonth] = await Promise.all([profitAndLoss(from, to), ...(allMonths.length > 1 ? allMonths.map((p) => profitAndLoss(p.from, p.to)) : [])]);
  // Leave out the empty months before anything happened.
  const first = byMonth.findIndex((p) => !p.sales.isZero() || !p.totalExpenses.isZero() || !p.stockDifferences.isZero());
  const cols = first < 0 ? [] : byMonth.slice(first);
  const periods = first < 0 ? [] : allMonths.slice(first);
  const categories = total.expenses.map((e) => e.category);
  const quick = [
    { label: "This month", from: new Date(Date.UTC(y, m, 1)), to: now },
    { label: "Last month", from: new Date(Date.UTC(y, m - 1, 1)), to: addDays(new Date(Date.UTC(y, m, 1)), -1) },
    { label: "This year", from: new Date(Date.UTC(y, 0, 1)), to: now },
    { label: "Last year", from: new Date(Date.UTC(y - 1, 0, 1)), to: new Date(Date.UTC(y - 1, 11, 31)) },
  ];

  const row = (label: string, get: (p: typeof total) => Decimal, { strong = false, indent = false } = {}) => (
    <tr key={label} className={strong ? "bg-slate-50" : ""}>
      <td className={`whitespace-nowrap ${strong ? "font-semibold" : ""} ${indent ? "pl-8" : ""}`}>{label}</td>
      {cols.map((c, i) => <Amount key={i} v={get(c)} strong={strong} />)}
      <Amount v={get(total)} strong />
    </tr>
  );

  return (
    <>
      <PageHeader title="Profit and loss" subtitle={`${formatDate(from)} to ${formatDate(to)} · EGP, before income tax`} />
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
          <button className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white">Show</button>
          <span className="ml-auto flex gap-3">
            {quick.map((q) => (
              <Link key={q.label} href={`?from=${toInputDate(q.from)}&to=${toInputDate(q.to)}`} className="text-brand-700 hover:underline">{q.label}</Link>
            ))}
          </span>
        </form>
      </Card>
      <Card padded={false}>
        <Table head={<tr><th /> {cols.map((_, i) => <th key={i} className="num">{periods[i].label}</th>)}<th className="num">Total</th></tr>}>
          {row("Sales (before VAT)", (p) => p.sales)}
          {row("Cost of goods sold (landed)", (p) => p.costOfSales.neg())}
          {row("Gross profit", (p) => p.grossProfit, { strong: true })}
          {row("Stock count differences", (p) => p.stockDifferences)}
          {categories.map((cat) => row(cat, (p) => (p.expenses.find((e) => e.category === cat)?.amount ?? new Decimal(0)).neg(), { indent: true }))}
          {row("Total expenses", (p) => p.totalExpenses.neg())}
          {row("Net profit", (p) => p.netProfit, { strong: true })}
          <tr>
            <td className="text-slate-500">Net margin</td>
            {cols.map((c, i) => <td key={i} className="num text-slate-500">{pct(c.netMargin)}</td>)}
            <td className="num text-slate-500">{pct(total.netMargin)}</td>
          </tr>
        </Table>
      </Card>
      <p className="mt-3 text-xs text-slate-500">
        Freight, duty and clearance are inside the cost of goods, counted when the goods are sold. Exchange gains or losses on supplier payments are not shown here yet.
      </p>
    </>
  );
}
