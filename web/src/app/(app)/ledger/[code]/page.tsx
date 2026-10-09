import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Field, Submit } from "@/components/forms";
import { Card, PageHeader, Table } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { getT } from "@/i18n/server";
import { today } from "@/lib/dates";
import { money } from "@/lib/format";
import { accountStatement, generalLedger, SECTIONS } from "@/lib/services/gl";
import { renameLedgerAccount } from "../actions";
import { Amount, DateFilter, dateParam, memoText } from "../parts";

export default async function LedgerAccountPage({ params, searchParams }: PageProps<"/ledger/[code]">) {
  const code = decodeURIComponent((await params).code);
  const sp = await searchParams;
  const [gl, user, t] = await Promise.all([generalLedger(), currentUser(), getT()]);
  const account = gl.accounts.find((a) => a.code === code);
  if (!account) notFound();
  const now = today();
  const from = dateParam(sp.from, new Date(Date.UTC(now.getUTCFullYear(), 0, 1)));
  const to = dateParam(sp.to, now);
  const s = accountStatement(gl, account, from, to);
  const debitNormal = SECTIONS[account.section].debitNormal;

  return (
    <>
      <PageHeader
        title={`${account.code} ${t(account.name)}`}
        subtitle={`${t(SECTIONS[account.section].label)} · ${t(debitNormal ? "debit balance" : "credit balance")} · EGP`}
        back={{ href: "/ledger", label: t("Chart of accounts") }}
        actions={account.moneyAccountId ? <Link href={`/accounts/${account.moneyAccountId}`} className="text-sm font-medium text-brand-700 hover:underline">{t("Open the bank statement")}</Link> : undefined}
      />
      <Card className="mb-4"><DateFilter from={from} to={to} /></Card>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className={account.ledgerAccountId && user?.role === "ADMIN" ? "lg:col-span-2" : "lg:col-span-3"}>
          <Table
            head={<tr><th>{t("Date")}</th><th>{t("Document")}</th><th>{t("Details")}</th><th className="num">{t("Debit")}</th><th className="num">{t("Credit")}</th><th className="num">{t("Balance")}</th></tr>}
            footer={<tr><td colSpan={5}>{t("Balance on {date}", { date: t.date(to) })}</td><Amount v={s.closing} strong /></tr>}
          >
            <tr className="text-slate-500"><td>{t.date(from)}</td><td colSpan={4}>{t("Brought forward")}</td><Amount v={s.opening} /></tr>
            {s.rows.map((r, i) => (
              <tr key={i}>
                <td>{t.date(r.entry.date)}</td>
                <td>{r.entry.href ? <Link href={r.entry.href} className="font-medium text-brand-700 hover:underline">{t(r.entry.ref)}</Link> : t(r.entry.ref)}</td>
                <td className="text-slate-600">{[memoText(t, r.entry.memo, { transfer: r.entry.ref === "Transfer" }), memoText(t, r.line.memo)].filter(Boolean).join(" · ")}</td>
                <td className="num">{r.line.debit.isZero() ? "" : money(r.line.debit)}</td>
                <td className="num">{r.line.credit.isZero() ? "" : money(r.line.credit)}</td>
                <Amount v={r.balance} />
              </tr>
            ))}
          </Table>
        </Card>
        {account.ledgerAccountId && user?.role === "ADMIN" && (
          <Card title={t("Account")}>
            <ActionForm action={renameLedgerAccount.bind(null, account.ledgerAccountId)}>
              <Field label={t("Name")} name="name" defaultValue={account.name} required />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="active" defaultChecked={account.active} /> {t("In use")}
              </label>
              <Submit>{t("Save")}</Submit>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
