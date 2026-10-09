import { Badge, ButtonLink, Card, PageHeader, RowLink, Table } from "@/components/ui";
import { getT } from "@/i18n/server";
import { qty } from "@/lib/format";
import { lowStock } from "@/lib/services/alerts";
import { monthsLabel } from "@/lib/reports/definitions";
import { productMovement, safetyStock, SAFETY_MONTHS } from "@/lib/services/rankings";
import { ExportButtons } from "@/components/export-buttons";

export async function generateMetadata() {
  return { title: (await getT())("Low stock") };
}

export default async function LowStockPage() {
  const t = await getT();
  const [rows, movement] = await Promise.all([lowStock(), productMovement()]);
  const safety = safetyStock(movement);

  return (
    <>
      <PageHeader
        title={t("Low stock")}
        subtitle={t("Products at or below their alert level. Set the level on each product.")}
        actions={
          <>
            <ExportButtons report="low-stock" />
            <ButtonLink href="/rfqs/new?from=low-stock" variant="secondary">{t("Ask suppliers for prices")}</ButtonLink>
            <ButtonLink href="/purchase-orders/new">{t("New purchase order")}</ButtonLink>
          </>
        }
      />
      <Card title={t("Below the alert level")} padded={false} className="mb-6">
        <Table
          head={<tr><th>{t("Product")}</th><th className="num">{t("On hand")}</th><th className="num">{t("Alert level")}</th><th className="num">{t("Ordered or on the way")}</th><th className="num">{t("Still to order")}</th></tr>}
          empty={t("Nothing is running low.")}
        >
          {rows.map((r) => (
            <tr key={r.itemId}>
              <td>
                <span className="me-2 inline-block font-mono text-xs text-slate-400">{r.code}</span>
                <RowLink href={`/products/${r.itemId}`}>{r.name}</RowLink>
              </td>
              <td className="num">{r.onHand.isZero() ? <Badge color="red">{t("Out of stock")}</Badge> : `${qty(r.onHand)} ${t(r.unit)}`}</td>
              <td className="num">{qty(r.minQty)} {t(r.unit)}</td>
              <td className="num">{r.coming.isZero() ? "" : `${qty(r.coming)} ${t(r.unit)}`}</td>
              <td className="num">{r.short.isZero() ? <Badge color="green">{t("Covered")}</Badge> : <span className="font-medium text-amber-700">{qty(r.short)} {t(r.unit)}</span>}</td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card
        title={t("Safety stock")}
        actions={
          <span className="flex flex-wrap gap-3 text-sm">
            {SAFETY_MONTHS.map((n) => (
              <RowLink key={n} href={`/rfqs/new?from=safety&months=${n}`}>{t("Ask prices for {period}", { period: monthsLabel(t, n) })}</RowLink>
            ))}
          </span>
        }
        padded={false}
      >
        <Table
          head={
            <tr>
              <th>{t("Product")}</th>
              <th className="num">{t("Sold per month")}</th>
              <th className="num">{t("On hand")}</th>
              <th className="num">{t("On order")}</th>
              <th className="num">{t("Months of stock")}</th>
              {SAFETY_MONTHS.map((n) => <th key={n} className="num">{t("Order for {period}", { period: monthsLabel(t, n) })}</th>)}
            </tr>
          }
          empty={t("No sales in the last six months to work from.")}
        >
          {safety.map((r) => (
            <tr key={r.itemId}>
              <td>
                <span className="me-2 inline-block font-mono text-xs text-slate-400">{r.code}</span>
                <RowLink href={`/products/${r.itemId}`}>{r.name}</RowLink>
              </td>
              <td className="num">{qty(r.monthlyRate.toDecimalPlaces(1))} {t(r.unit)}</td>
              <td className="num">{r.onHand.isZero() ? <Badge color="red">{t("Out of stock")}</Badge> : `${qty(r.onHand)} ${t(r.unit)}`}</td>
              <td className="num">{r.onOrder.isZero() ? "" : `${qty(r.onOrder)} ${t(r.unit)}`}</td>
              <td className={`num ${r.coverMonths!.lt(1) ? "font-medium text-red-700" : r.coverMonths!.lt(3) ? "text-amber-700" : ""}`}>{qty(r.coverMonths!.toDecimalPlaces(1))}</td>
              {r.periods.map((p) => (
                <td key={p.months} className="num">
                  {p.short.isZero() ? <Badge color="green">{t("Covered")}</Badge> : <span className="font-medium text-amber-700">{qty(p.short.toDecimalPlaces(1))} {t(r.unit)}</span>}
                  <div className="text-xs text-slate-400">{t("Need {qty}", { qty: qty(p.need.toDecimalPlaces(1)) })}</div>
                </td>
              ))}
            </tr>
          ))}
        </Table>
        <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
          {t("Sold per month is the average of the last six months. To order is what is needed for that many months, less what is on hand and already ordered.")}
        </p>
      </Card>
    </>
  );
}
