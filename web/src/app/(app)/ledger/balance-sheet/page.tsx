import type Decimal from "decimal.js";
import { Card, PageHeader } from "@/components/ui";
import type { T } from "@/i18n/core";
import { getT } from "@/i18n/server";
import { today } from "@/lib/dates";
import { balanceSheet, generalLedger, type GlAccount } from "@/lib/services/gl";
import { AccountLink, Amount, DateFilter, dateParam, Warnings } from "../parts";

export async function generateMetadata() {
  return { title: (await getT())("Balance sheet") };
}

type Section = { lines: { account: GlAccount; amount: Decimal }[]; total: Decimal };

function Lines({ t, title, totalLabel, section }: { t: T; title: string; totalLabel: string; section: Section }) {
  if (!section.lines.length) return null;
  return (
    <>
      <tr><td colSpan={2} className="pt-4 text-xs font-semibold uppercase tracking-wider text-brand-900/60">{t(title)}</td></tr>
      {section.lines.map((l) => (
        <tr key={l.account.code}>
          <td className="ps-4"><span className="me-2 inline-block font-mono text-xs text-slate-400">{l.account.code}</span><AccountLink code={l.account.code}>{t(l.account.name)}</AccountLink></td>
          <Amount v={l.amount} />
        </tr>
      ))}
      <tr className="border-t border-slate-100"><td className="ps-4 text-slate-600">{t(totalLabel)}</td><Amount v={section.total} /></tr>
    </>
  );
}

const Total = ({ label, v }: { label: string; v: Decimal }) => (
  <tr className="border-t-2 border-brand-600 bg-brand-50/60"><td className="py-2 font-semibold text-brand-900">{label}</td><Amount v={v} strong /></tr>
);

export default async function BalanceSheetPage({ searchParams }: PageProps<"/ledger/balance-sheet">) {
  const asOf = dateParam((await searchParams).asOf, today());
  const [gl, t] = await Promise.all([generalLedger(), getT()]);
  const bs = balanceSheet(gl, asOf);
  const difference = bs.totalAssets.minus(bs.totalLiabilities).minus(bs.totalEquity);

  return (
    <>
      <PageHeader title={t("Balance sheet")} subtitle={t("On {date} · EGP", { date: t.date(asOf) })} back={{ href: "/ledger", label: t("Chart of accounts") }} />
      <Card className="mb-4"><DateFilter asOf={asOf} /></Card>
      <Warnings items={gl.warnings} />
      {!difference.isZero() && <Warnings items={[`Assets and liabilities plus equity differ by ${difference.toFixed(2)}.`]} />}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t("What the company has")}>
          <table className="w-full text-sm">
            <tbody>
              <Lines t={t} title="Current assets" totalLabel="Total current assets" section={bs.currentAssets} />
              <Lines t={t} title="Fixed assets" totalLabel="Total fixed assets" section={bs.fixedAssets} />
              <Total label={t("Total assets")} v={bs.totalAssets} />
            </tbody>
          </table>
        </Card>
        <Card title={t("What it owes, and the owners' share")}>
          <table className="w-full text-sm">
            <tbody>
              <Lines t={t} title="Current liabilities" totalLabel="Total current liabilities" section={bs.currentLiabilities} />
              <Lines t={t} title="Long-term liabilities" totalLabel="Total long-term liabilities" section={bs.longTermLiabilities} />
              <Total label={t("Total liabilities")} v={bs.totalLiabilities} />
              <Lines t={t} title="Equity" totalLabel="Total equity" section={bs.equity} />
              <tr><td className="ps-4">{t("Profit from earlier years, not yet closed")}</td><Amount v={bs.earlierProfit} /></tr>
              <tr><td className="ps-4">{t("Profit this year")}</td><Amount v={bs.profitThisYear} /></tr>
              <Total label={t("Total equity")} v={bs.totalEquity} />
              <Total label={t("Total liabilities and equity")} v={bs.totalLiabilities.plus(bs.totalEquity)} />
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
