import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Field, Submit } from "@/components/forms";
import { Card, PageHeader, Table } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { formatDate, today } from "@/lib/dates";
import { money } from "@/lib/format";
import { accountStatement, generalLedger, SECTIONS } from "@/lib/services/gl";
import { renameLedgerAccount } from "../actions";
import { Amount, DateFilter, dateParam } from "../parts";

export default async function LedgerAccountPage({ params, searchParams }: PageProps<"/ledger/[code]">) {
  const code = decodeURIComponent((await params).code);
  const sp = await searchParams;
  const [gl, user] = await Promise.all([generalLedger(), currentUser()]);
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
        title={`${account.code} ${account.name}`}
        subtitle={`${SECTIONS[account.section].label} · ${debitNormal ? "debit" : "credit"} balance · EGP`}
        back={{ href: "/ledger", label: "Chart of accounts" }}
        actions={account.moneyAccountId ? <Link href={`/accounts/${account.moneyAccountId}`} className="text-sm font-medium text-brand-700 hover:underline">Open the bank statement</Link> : undefined}
      />
      <Card className="mb-4"><DateFilter from={from} to={to} /></Card>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className={account.ledgerAccountId && user?.role === "ADMIN" ? "lg:col-span-2" : "lg:col-span-3"}>
          <Table
            head={<tr><th>Date</th><th>Document</th><th>Details</th><th className="num">Debit</th><th className="num">Credit</th><th className="num">Balance</th></tr>}
            footer={<tr><td colSpan={5}>Balance on {formatDate(to)}</td><Amount v={s.closing} strong /></tr>}
          >
            <tr className="text-slate-500"><td>{formatDate(from)}</td><td colSpan={4}>Brought forward</td><Amount v={s.opening} /></tr>
            {s.rows.map((r, i) => (
              <tr key={i}>
                <td>{formatDate(r.entry.date)}</td>
                <td>{r.entry.href ? <Link href={r.entry.href} className="font-medium text-brand-700 hover:underline">{r.entry.ref}</Link> : r.entry.ref}</td>
                <td className="text-slate-600">{[r.entry.memo, r.line.memo].filter(Boolean).join(" · ")}</td>
                <td className="num">{r.line.debit.isZero() ? "" : money(r.line.debit)}</td>
                <td className="num">{r.line.credit.isZero() ? "" : money(r.line.credit)}</td>
                <Amount v={r.balance} />
              </tr>
            ))}
          </Table>
        </Card>
        {account.ledgerAccountId && user?.role === "ADMIN" && (
          <Card title="Account">
            <ActionForm action={renameLedgerAccount.bind(null, account.ledgerAccountId)}>
              <Field label="Name" name="name" defaultValue={account.name} required />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="active" defaultChecked={account.active} /> In use
              </label>
              <Submit>Save</Submit>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
