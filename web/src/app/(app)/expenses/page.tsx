import Decimal from "decimal.js";
import { ActionForm, Field, Submit } from "@/components/forms";
import { Card, PageHeader, Table } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { formatDate, parseInputDate, toInputDate, today } from "@/lib/dates";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { EXPENSE_CATEGORIES } from "@/lib/services/profit";
import { accountOptions, AccountSelect } from "../payments/parts";
import { addExpense, deleteExpense } from "./actions";

export const metadata = { title: "Expenses" };

function safeDate(v: unknown, fallback: Date) {
  try {
    return parseInputDate(typeof v === "string" ? v : "") ?? fallback;
  } catch {
    return fallback;
  }
}

export default async function ExpensesPage({ searchParams }: PageProps<"/expenses">) {
  const sp = await searchParams;
  const now = today();
  const from = safeDate(sp.from, new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  const to = safeDate(sp.to, now);
  const [expenses, accounts, user] = await Promise.all([
    db.expense.findMany({ where: { date: { gte: from, lte: to } }, include: { account: true }, orderBy: [{ date: "desc" }, { id: "desc" }] }),
    accountOptions({ egpOnly: true }),
    currentUser(),
  ]);
  const byCategory = new Map<string, Decimal>();
  for (const e of expenses) byCategory.set(e.category, (byCategory.get(e.category) ?? new Decimal(0)).plus(e.amount.toString()));
  const total = [...byCategory.values()].reduce((s, v) => s.plus(v), new Decimal(0));
  const vat = expenses.reduce((s, e) => s.plus(e.vat.toString()), new Decimal(0));

  return (
    <>
      <PageHeader title="Expenses" subtitle="Running costs: rent, salaries, transport. Freight and customs go on the shipment, so they become part of the product cost." />
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
          <span className="ml-auto text-slate-600">{formatDate(from)} to {formatDate(to)}: <strong className="text-slate-900">EGP {money(total)}</strong> before VAT</span>
        </form>
      </Card>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="By category" padded={false}>
            <Table head={<tr><th>Category</th><th className="num">Amount (EGP)</th><th className="num">Share</th></tr>} empty="No expenses in these dates." footer={total.gt(0) && <tr><td>Total</td><td className="num">{money(total)}</td><td /></tr>}>
              {[...byCategory].sort((a, b) => b[1].cmp(a[1])).map(([cat, v]) => (
                <tr key={cat}><td>{cat}</td><td className="num">{money(v)}</td><td className="num">{v.div(total).times(100).toFixed(0)}%</td></tr>
              ))}
            </Table>
          </Card>
          <Card title="Each expense" padded={false}>
            <Table head={<tr><th>Date</th><th>Expense</th><th>Paid from</th><th className="num">Amount</th><th className="num">VAT</th><th /></tr>} empty="No expenses in these dates." footer={vat.gt(0) && <tr><td colSpan={4}>VAT you can reclaim</td><td className="num">{money(vat)}</td><td /></tr>}>
              {expenses.map((e) => (
                <tr key={e.id}>
                  <td>{formatDate(e.date)}</td>
                  <td>
                    {e.category}{e.payee && <span className="text-slate-500"> · {e.payee}</span>}
                    <div className="text-xs text-slate-500">{[e.number, e.description, e.reference].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td>{e.account?.name}</td>
                  <td className="num">{money(e.amount)}</td>
                  <td className="num">{e.vat.toString() === "0" ? "" : money(e.vat)}</td>
                  <td className="text-right">
                    {user?.role === "ADMIN" && (
                      <form action={deleteExpense.bind(null, e.id)}>
                        <button className="text-xs text-slate-400 hover:text-red-600">Delete</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
        <Card title="Add an expense">
          <ActionForm action={addExpense} resetOnSuccess>
            <Field label="Category" name="category" list="expense-categories" required hint="Pick one or type your own" />
            <datalist id="expense-categories">{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount before VAT (EGP)" name="amount" inputMode="decimal" required />
              <Field label="VAT (EGP)" name="vat" inputMode="decimal" hint="If the bill shows VAT" />
            </div>
            <Field label="Date" name="date" type="date" defaultValue={toInputDate(now)} required />
            <AccountSelect label="Paid from" accounts={accounts} />
            <Field label="Paid to" name="payee" />
            <Field label="Details" name="description" />
            <Field label="Reference" name="reference" hint="Bill or receipt number" />
            <Submit>Save expense</Submit>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
