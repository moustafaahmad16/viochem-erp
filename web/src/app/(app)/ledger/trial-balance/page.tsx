import { Card, PageHeader, Table } from "@/components/ui";
import { formatDate, today } from "@/lib/dates";
import { money } from "@/lib/format";
import { generalLedger, SECTIONS, trialBalance } from "@/lib/services/gl";
import { AccountLink, DateFilter, dateParam, Warnings } from "../parts";

export const metadata = { title: "Trial balance" };

export default async function TrialBalancePage({ searchParams }: PageProps<"/ledger/trial-balance">) {
  const asOf = dateParam((await searchParams).asOf, today());
  const gl = await generalLedger();
  const tb = trialBalance(gl, asOf);
  const balanced = tb.debit.eq(tb.credit);

  return (
    <>
      <PageHeader title="Trial balance" subtitle={`On ${formatDate(asOf)} · EGP`} back={{ href: "/ledger", label: "Chart of accounts" }} />
      <Card className="mb-4"><DateFilter asOf={asOf} /></Card>
      <Warnings items={gl.warnings} />
      <Card padded={false}>
        <Table
          head={<tr><th className="w-24">Code</th><th>Account</th><th>Section</th><th className="num">Debit</th><th className="num">Credit</th></tr>}
          empty="Nothing posted yet."
          footer={
            <tr>
              <td colSpan={3}>Total {balanced ? <span className="ml-2 text-emerald-700">Balanced</span> : <span className="ml-2 text-red-700">Not balanced</span>}</td>
              <td className="num">{money(tb.debit)}</td>
              <td className="num">{money(tb.credit)}</td>
            </tr>
          }
        >
          {tb.rows.map((r) => (
            <tr key={r.account.code}>
              <td className="font-mono text-xs text-slate-500">{r.account.code}</td>
              <td><AccountLink code={r.account.code}>{r.account.name}</AccountLink></td>
              <td className="text-slate-500">{SECTIONS[r.account.section].label}</td>
              <td className="num">{r.debit.isZero() ? "" : money(r.debit)}</td>
              <td className="num">{r.credit.isZero() ? "" : money(r.credit)}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
