import { Badge, ButtonLink, Card, PageHeader, RowLink, Table } from "@/components/ui";
import { getT } from "@/i18n/server";
import { qty } from "@/lib/format";
import { lowStock } from "@/lib/services/alerts";

export async function generateMetadata() {
  return { title: (await getT())("Low stock") };
}

export default async function LowStockPage() {
  const t = await getT();
  const rows = await lowStock();

  return (
    <>
      <PageHeader
        title={t("Low stock")}
        subtitle={t("Products at or below their alert level. Set the level on each product.")}
        actions={
          <>
            <ButtonLink href="/rfqs/new?from=low-stock" variant="secondary">{t("Ask suppliers for prices")}</ButtonLink>
            <ButtonLink href="/purchase-orders/new">{t("New purchase order")}</ButtonLink>
          </>
        }
      />
      <Card padded={false}>
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
    </>
  );
}
