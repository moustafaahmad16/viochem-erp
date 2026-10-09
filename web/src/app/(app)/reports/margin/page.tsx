import { ExportButtons } from "@/components/export-buttons";
import { Card, PageHeader, Table } from "@/components/ui";
import { parseInputDate, toInputDate, today } from "@/lib/dates";
import { money, pct, qty } from "@/lib/format";
import { marginReport, type MarginGroup } from "@/lib/services/reports";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("Margins") };
}

const GROUPS: { key: MarginGroup; label: string }[] = [
  { key: "item", label: "Product" },
  { key: "customer", label: "Customer" },
  { key: "shipment", label: "Shipment" },
  { key: "lot", label: "Lot" },
];

function safeDate(v: unknown, fallback: Date) {
  try {
    return parseInputDate(typeof v === "string" ? v : "") ?? fallback;
  } catch {
    return fallback;
  }
}

export default async function MarginPage({ searchParams }: PageProps<"/reports/margin">) {
  const t = await getT();
  const sp = await searchParams;
  const now = today();
  const from = safeDate(sp.from, new Date(Date.UTC(now.getUTCFullYear(), 0, 1)));
  const to = safeDate(sp.to, now);
  const groupBy = (GROUPS.find((g) => g.key === sp.by)?.key ?? "item") as MarginGroup;
  const { rows, total } = await marginReport(from, to, groupBy);
  const groupLabel = GROUPS.find((g) => g.key === groupBy)!.label;

  return (
    <>
      <PageHeader title={t("Margins")} subtitle={t("Sales against the real landed cost of the lots that were sold")} actions={<ExportButtons report="margin" query={{ from: toInputDate(from), to: toInputDate(to), by: groupBy }} />} />
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
          <label>
            <span className="mb-1 block text-slate-600">{t("Group by")}</span>
            <select name="by" defaultValue={groupBy} className="rounded-lg border border-slate-300 px-3 py-2">
              {GROUPS.map((g) => (
                <option key={g.key} value={g.key}>{t(g.label)}</option>
              ))}
            </select>
          </label>
          <button className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700">{t("Show")}</button>
        </form>
      </Card>
      <Card padded={false}>
        <Table
          head={<tr><th>{t(groupLabel)}</th><th className="num">{t("Qty sold")}</th><th className="num">{t("Sales (EGP)")}</th><th className="num">{t("Cost (EGP)")}</th><th className="num">{t("Margin (EGP)")}</th><th className="num">{t("Margin %")}</th></tr>}
          empty={t("No posted sales in these dates.")}
          footer={
            rows.length > 0 && (
              <tr><td>{t("Total")}</td><td className="num">{qty(total.qty)}</td><td className="num">{money(total.revenue)}</td><td className="num">{money(total.cost)}</td><td className="num">{money(total.margin)}</td><td className="num">{pct(total.marginPct)}</td></tr>
            )
          }
        >
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{r.key === "opening" || r.key === "allowances" ? t(r.label) : r.label}{r.sub && <span className="ms-2 text-xs text-slate-500">{r.sub}</span>}</td>
              <td className="num">{qty(r.qty)}</td>
              <td className="num">{money(r.revenue)}</td>
              <td className="num">{money(r.cost)}</td>
              <td className={`num ${r.margin.lt(0) ? "text-red-700" : ""}`}>{money(r.margin)}</td>
              <td className="num">
                <span className="inline-flex items-center gap-2">
                  <span className="hidden h-1.5 w-16 overflow-hidden rounded bg-slate-100 sm:inline-block">
                    <span className="block h-full bg-accent-500" style={{ width: `${Math.max(0, Math.min(100, r.marginPct.toNumber()))}%` }} />
                  </span>
                  {pct(r.marginPct)}
                </span>
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
