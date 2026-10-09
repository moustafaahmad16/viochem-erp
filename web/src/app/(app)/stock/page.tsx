import Decimal from "decimal.js";
import { Badge, ButtonLink, Card, PageHeader, RowLink, Table } from "@/components/ui";
import { addDays, today } from "@/lib/dates";
import { getT } from "@/i18n/server";
import { money, qty } from "@/lib/format";
import { lowStock } from "@/lib/services/alerts";
import { stockSummary } from "@/lib/services/reports";

export async function generateMetadata() {
  return { title: (await getT())("Stock on hand") };
}

export default async function StockPage() {
  const t = await getT();
  const [rows, low] = await Promise.all([stockSummary(), lowStock()]);
  const lowIds = new Set(low.map((r) => r.itemId));
  const total = rows.reduce((sum, r) => sum.plus(r.value), new Decimal(0));
  const soon = addDays(today(), 90);

  return (
    <>
      <PageHeader
        title={t("Stock on hand")}
        subtitle={<>{t("Valued at landed cost:")} <span className="font-semibold text-slate-800">EGP {money(total)}</span></>}
        actions={
          <>
            {low.length > 0 && <ButtonLink href="/reports/low-stock" variant="secondary">{t("{n} running low", { n: low.length })}</ButtonLink>}
            <ButtonLink href="/stock/opening" variant="secondary">{t("Add opening stock")}</ButtonLink>
          </>
        }
      />
      <Card padded={false}>
        <Table
          head={<tr><th>{t("Product")}</th><th className="num">{t("On hand")}</th><th className="num">{t("Lots")}</th><th>{t("Next expiry")}</th><th className="num">{t("Avg cost / unit")}</th><th className="num">{t("Value (EGP)")}</th></tr>}
          empty={t("No stock yet. Receive a shipment or add the stock you already have.")}
          footer={rows.length > 0 && <tr><td colSpan={5}>{t("Total")}</td><td className="num">{money(total)}</td></tr>}
        >
          {rows.map((r) => (
            <tr key={r.itemId} className="hover:bg-slate-50">
              <td><RowLink href={`/products/${r.itemId}`}>{r.name}</RowLink> <span className="text-xs text-slate-500">{r.code}</span></td>
              <td className="num">{lowIds.has(r.itemId) && <span className="me-2"><Badge color="amber">{t("Low")}</Badge></span>}{qty(r.qty)} {t(r.unit)}</td>
              <td className="num">{r.lots}</td>
              <td className={r.nextExpiry && r.nextExpiry <= soon ? "font-medium text-amber-700" : ""}>{t.date(r.nextExpiry)}</td>
              <td className="num">{money(r.value.div(r.qty))}</td>
              <td className="num">{money(r.value)}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
