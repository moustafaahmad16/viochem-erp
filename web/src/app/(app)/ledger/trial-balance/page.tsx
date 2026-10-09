import { Card, PageHeader, Table } from "@/components/ui";
import { getT } from "@/i18n/server";
import { today } from "@/lib/dates";
import { money } from "@/lib/format";
import { generalLedger, SECTIONS, trialBalance } from "@/lib/services/gl";
import { AccountLink, DateFilter, dateParam, Warnings } from "../parts";

export async function generateMetadata() {
  return { title: (await getT())("Trial balance") };
}

export default async function TrialBalancePage({ searchParams }: PageProps<"/ledger/trial-balance">) {
  const asOf = dateParam((await searchParams).asOf, today());
  const [gl, t] = await Promise.all([generalLedger(), getT()]);
  const tb = trialBalance(gl, asOf);
  const balanced = tb.debit.eq(tb.credit);

  return (
    <>
      <PageHeader title={t("Trial balance")} subtitle={t("On {date} · EGP", { date: t.date(asOf) })} back={{ href: "/ledger", label: t("Chart of accounts") }} />
      <Card className="mb-4"><DateFilter asOf={asOf} /></Card>
      <Warnings items={gl.warnings} />
      <Card padded={false}>
        <Table
          head={<tr><th className="w-24">{t("Code")}</th><th>{t("Account")}</th><th>{t("Section")}</th><th className="num">{t("Debit")}</th><th className="num">{t("Credit")}</th></tr>}
          empty={t("Nothing posted yet.")}
          footer={
            <tr>
              <td colSpan={3}>{t("Total")} {balanced ? <span className="ms-2 text-emerald-700">{t("Balanced")}</span> : <span className="ms-2 text-red-700">{t("Not balanced")}</span>}</td>
              <td className="num">{money(tb.debit)}</td>
              <td className="num">{money(tb.credit)}</td>
            </tr>
          }
        >
          {tb.rows.map((r) => (
            <tr key={r.account.code}>
              <td className="font-mono text-xs text-slate-500">{r.account.code}</td>
              <td><AccountLink code={r.account.code}>{t(r.account.name)}</AccountLink></td>
              <td className="text-slate-500">{t(SECTIONS[r.account.section].label)}</td>
              <td className="num">{r.debit.isZero() ? "" : money(r.debit)}</td>
              <td className="num">{r.credit.isZero() ? "" : money(r.credit)}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
