import type Decimal from "decimal.js";
import { Card, PageHeader } from "@/components/ui";
import { formatDate, today } from "@/lib/dates";
import { balanceSheet, generalLedger, type GlAccount } from "@/lib/services/gl";
import { AccountLink, Amount, DateFilter, dateParam, Warnings } from "../parts";

export const metadata = { title: "Balance sheet" };

type Section = { lines: { account: GlAccount; amount: Decimal }[]; total: Decimal };

function Lines({ title, section }: { title: string; section: Section }) {
  if (!section.lines.length) return null;
  return (
    <>
      <tr><td colSpan={2} className="pt-4 text-xs font-semibold uppercase tracking-wider text-brand-900/60">{title}</td></tr>
      {section.lines.map((l) => (
        <tr key={l.account.code}>
          <td className="ps-4"><span className="me-2 font-mono text-xs text-slate-400">{l.account.code}</span><AccountLink code={l.account.code}>{l.account.name}</AccountLink></td>
          <Amount v={l.amount} />
        </tr>
      ))}
      <tr className="border-t border-slate-100"><td className="ps-4 text-slate-600">Total {title.toLowerCase()}</td><Amount v={section.total} /></tr>
    </>
  );
}

const Total = ({ label, v }: { label: string; v: Decimal }) => (
  <tr className="border-t-2 border-brand-600 bg-brand-50/60"><td className="py-2 font-semibold text-brand-900">{label}</td><Amount v={v} strong /></tr>
);

export default async function BalanceSheetPage({ searchParams }: PageProps<"/ledger/balance-sheet">) {
  const asOf = dateParam((await searchParams).asOf, today());
  const gl = await generalLedger();
  const bs = balanceSheet(gl, asOf);
  const difference = bs.totalAssets.minus(bs.totalLiabilities).minus(bs.totalEquity);

  return (
    <>
      <PageHeader title="Balance sheet" subtitle={`On ${formatDate(asOf)} · EGP`} back={{ href: "/ledger", label: "Chart of accounts" }} />
      <Card className="mb-4"><DateFilter asOf={asOf} /></Card>
      <Warnings items={gl.warnings} />
      {!difference.isZero() && <Warnings items={[`Assets and liabilities plus equity differ by ${difference.toFixed(2)}.`]} />}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="What the company has">
          <table className="w-full text-sm">
            <tbody>
              <Lines title="Current assets" section={bs.currentAssets} />
              <Lines title="Fixed assets" section={bs.fixedAssets} />
              <Total label="Total assets" v={bs.totalAssets} />
            </tbody>
          </table>
        </Card>
        <Card title="What it owes, and the owners' share">
          <table className="w-full text-sm">
            <tbody>
              <Lines title="Current liabilities" section={bs.currentLiabilities} />
              <Lines title="Long-term liabilities" section={bs.longTermLiabilities} />
              <Total label="Total liabilities" v={bs.totalLiabilities} />
              <Lines title="Equity" section={bs.equity} />
              <tr><td className="ps-4">Profit from earlier years, not yet closed</td><Amount v={bs.earlierProfit} /></tr>
              <tr><td className="ps-4">Profit this year</td><Amount v={bs.profitThisYear} /></tr>
              <Total label="Total equity" v={bs.totalEquity} />
              <Total label="Total liabilities and equity" v={bs.totalLiabilities.plus(bs.totalEquity)} />
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
