import Decimal from "decimal.js";
import { ActionForm, Field, Select, Submit } from "@/components/forms";
import { Card, PageHeader, Table } from "@/components/ui";
import { getT } from "@/i18n/server";
import { currentUser } from "@/lib/auth";
import { parseInputDate, toInputDate, today } from "@/lib/dates";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { expenseAccounts } from "@/lib/services/profit";
import { accountOptions, AccountSelect } from "../payments/parts";
import { addExpense, deleteExpense } from "./actions";

export async function generateMetadata() {
  return { title: (await getT())("Expenses") };
}

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
  const [expenses, accounts, user, categories, t] = await Promise.all([
    db.expense.findMany({ where: { date: { gte: from, lte: to } }, include: { account: true }, orderBy: [{ date: "desc" }, { id: "desc" }] }),
    accountOptions({ egpOnly: true }),
    currentUser(),
    expenseAccounts(),
    getT(),
  ]);
  const groupOf = new Map(categories.map((c) => [c.category.toLowerCase(), c.group]));
  const byCategory = new Map<string, Decimal>();
  for (const e of expenses) byCategory.set(e.category, (byCategory.get(e.category) ?? new Decimal(0)).plus(e.amount.toString()));
  const total = [...byCategory.values()].reduce((s, v) => s.plus(v), new Decimal(0));
  const vat = expenses.reduce((s, e) => s.plus(e.vat.toString()), new Decimal(0));

  return (
    <>
      <PageHeader title={t("Expenses")} subtitle={t("Running costs: rent, salaries, transport. Freight and customs go on the shipment, so they become part of the product cost.")} />
      <Card className="mb-4">
        <form className="flex flex-wrap items-end gap-3 text-sm">
          <label>
            <span className="mb-1 block text-slate-600">{t("From")}</span>
            <input type="date" name="from" defaultValue={toInputDate(from)} className="rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label>
            <span className="mb-1 block text-slate-600">{t("To")}</span>
            <input type="date" name="to" defaultValue={toInputDate(to)} className="rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <button className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700">{t("Show")}</button>
          <span className="ms-auto text-slate-600">{t.date(from)} {t("to")} {t.date(to)}: <strong className="text-slate-900">EGP {money(total)}</strong> {t("before VAT")}</span>
        </form>
      </Card>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={t("By category")} padded={false}>
            <Table head={<tr><th>{t("Category")}</th><th className="num">{t("Amount (EGP)")}</th><th className="num">{t("Share")}</th></tr>} empty={t("No expenses in these dates.")} footer={total.gt(0) && <tr><td>{t("Total")}</td><td className="num">{money(total)}</td><td /></tr>}>
              {[...byCategory].sort((a, b) => b[1].cmp(a[1])).map(([cat, v]) => (
                <tr key={cat}><td>{t(cat)}<div className="text-xs text-slate-500">{t(groupOf.get(cat.toLowerCase()) ?? "General and administrative")}{groupOf.has(cat.toLowerCase()) ? "" : ` · ${t("Other")}`}</div></td><td className="num">{money(v)}</td><td className="num">{v.div(total).times(100).toFixed(0)}%</td></tr>
              ))}
            </Table>
          </Card>
          <Card title={t("Each expense")} padded={false}>
            <Table head={<tr><th>{t("Date")}</th><th>{t("Expense")}</th><th>{t("Paid from")}</th><th className="num">{t("Amount")}</th><th className="num">{t("VAT")}</th><th /></tr>} empty={t("No expenses in these dates.")} footer={vat.gt(0) && <tr><td colSpan={4}>{t("VAT you can reclaim")}</td><td className="num">{money(vat)}</td><td /></tr>}>
              {expenses.map((e) => (
                <tr key={e.id}>
                  <td>{t.date(e.date)}</td>
                  <td>
                    {t(e.category)}{e.payee && <span className="text-slate-500"> · {e.payee}</span>}
                    <div className="text-xs text-slate-500">{[e.number, e.description, e.reference].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td>{e.account?.name}</td>
                  <td className="num">{money(e.amount)}</td>
                  <td className="num">{e.vat.toString() === "0" ? "" : money(e.vat)}</td>
                  <td className="text-end">
                    {user?.role === "ADMIN" && (
                      <form action={deleteExpense.bind(null, e.id)}>
                        <button className="text-xs text-slate-400 hover:text-red-600">{t("Delete")}</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
        <Card title={t("Add an expense")}>
          <ActionForm action={addExpense} resetOnSuccess>
            <Select label={t("Category")} name="category" required placeholder={t("Choose")} options={categories.map((c) => ({ value: c.category, label: t(c.category), group: t(c.group) }))} hint={t("Your accountant can add more in the chart of accounts")} />
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("Amount before VAT (EGP)")} name="amount" inputMode="decimal" required />
              <Field label={t("VAT (EGP)")} name="vat" inputMode="decimal" hint={t("If the bill shows VAT")} />
            </div>
            <Field label={t("Date")} name="date" type="date" defaultValue={toInputDate(now)} required />
            <AccountSelect label="Paid from" accounts={accounts} />
            <Field label={t("Paid to")} name="payee" />
            <Field label={t("Details")} name="description" />
            <Field label={t("Reference")} name="reference" hint={t("Bill or receipt number")} />
            <Submit>{t("Save expense")}</Submit>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
