import { Card, PageHeader, RowLink, Table } from "@/components/ui";
import { today } from "@/lib/dates";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { withholdingReport } from "@/lib/services/reports";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("Withholding tax") };
}

/** Quarters from the first invoice with withholding tax to this one, newest first, as "2026-Q4". */
function quarters(first: Date | null, now: Date) {
  const end = now.getUTCFullYear() * 4 + Math.floor(now.getUTCMonth() / 3);
  const start = first ? Math.min(end, first.getUTCFullYear() * 4 + Math.floor(first.getUTCMonth() / 3)) : end;
  const out = [];
  for (let n = end; n >= start; n--) out.push({ key: `${Math.floor(n / 4)}-Q${(n % 4) + 1}`, year: Math.floor(n / 4), q: n % 4 });
  return out;
}

/** Withholding tax (خصم الضريبة) customers deducted, per customer and quarter, for the income tax return. */
export default async function WithholdingPage({ searchParams }: PageProps<"/reports/wht">) {
  const t = await getT();
  const first = await db.invoice.aggregate({ where: { status: "POSTED", whtRate: { gt: 0 } }, _min: { date: true } });
  const list = quarters(first._min.date, today());
  const asked = (await searchParams).quarter;
  const picked = list.find((q) => q.key === asked) ?? list[0];
  const from = new Date(Date.UTC(picked.year, picked.q * 3, 1));
  const to = new Date(Date.UTC(picked.year, picked.q * 3 + 3, 0));
  const { rows, total } = await withholdingReport(from, to);

  return (
    <>
      <PageHeader title={t("Withholding tax")} subtitle={t("Tax customers deducted from their payments (خصم الضريبة) and paid to the tax authority for VIOCHEM")} />
      <Card className="mb-4">
        <form className="flex flex-wrap items-end gap-3 text-sm">
          <label>
            <span className="mb-1 block text-slate-600">{t("Quarter")}</span>
            <select name="quarter" defaultValue={picked.key} className="rounded-lg border border-slate-300 px-3 py-2">
              {list.map((q) => (
                <option key={q.key} value={q.key}>{t("Q{q} {year}", { q: q.q + 1, year: q.year })}</option>
              ))}
            </select>
          </label>
          <button className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700">{t("Show")}</button>
          <span className="pb-2 text-slate-500">{t.date(from)} – {t.date(to)}</span>
        </form>
      </Card>
      <Card padded={false}>
        <Table
          head={<tr><th>{t("Customer")}</th><th>{t("Tax registration no.")}</th><th>{t("Invoices and credit notes")}</th><th className="num">{t("Sales (before VAT)")}</th><th className="num">{t("Withheld")}</th></tr>}
          empty={t("No invoices with withholding tax in this quarter.")}
          footer={rows.length > 0 && <tr><td colSpan={3}>{t("Total")}</td><td className="num">{money(total.net)}</td><td className="num">{money(total.wht)}</td></tr>}
        >
          {rows.map((r) => (
            <tr key={r.customerId}>
              <td><RowLink href={`/customers/${r.customerId}`}>{r.name}</RowLink></td>
              <td dir="ltr">{r.taxId}</td>
              <td className="max-w-xs truncate text-slate-600">{r.documents.join(", ")}</td>
              <td className="num">{money(r.net)}</td>
              <td className="num font-medium">{money(r.wht)}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
