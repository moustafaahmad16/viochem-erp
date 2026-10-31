import { Badge, ButtonLink, Card, PageHeader, RowLink, Table } from "@/components/ui";
import { db } from "@/lib/db";
import { qty } from "@/lib/format";
import { getT } from "@/i18n/server";
import { allBatches, batchName, expiresSoon, isExpired } from "@/lib/services/batches";

export async function generateMetadata() {
  return { title: (await getT())("Batches") };
}

/** Every batch of every product, with its dates, what is left of it and its test certificate. */
export default async function BatchesPage({ searchParams }: PageProps<"/stock/batches">) {
  const t = await getT();
  const sp = await searchParams;
  const q = String(sp.q ?? "").trim().toLowerCase();
  const all = sp.show === "all";
  const itemId = Number(sp.item) || undefined;
  const [batches, item] = await Promise.all([allBatches({ itemId, inStock: !all }), itemId ? db.item.findUnique({ where: { id: itemId } }) : null]);
  const rows = q
    ? batches.filter((b) => [b.item.name, b.item.code, b.item.casNumber ?? "", b.lotNo, b.supplierBatchNo ?? "", b.shipmentLine?.shipment.supplier.name ?? ""].some((s) => s.toLowerCase().includes(q)))
    : batches;
  const link = (show: string) => `/stock/batches?${new URLSearchParams({ ...(q ? { q } : {}), ...(itemId ? { item: String(itemId) } : {}), ...(show === "all" ? { show } : {}) })}`;
  const pill = (on: boolean) => `rounded-full px-3 py-1 text-sm ${on ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-200"}`;

  return (
    <>
      <PageHeader
        title={item ? t("Batches of {product}", { product: item.name }) : t("Batches")}
        subtitle={t("Each batch keeps its supplier's batch number, dates and test certificate.")}
        back={item ? { href: `/products/${item.id}`, label: item.name } : undefined}
        actions={<ButtonLink href="/stock/opening" variant="secondary">{t("Add opening stock")}</ButtonLink>}
      />
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-3">
          <form>
            {all && <input type="hidden" name="show" value="all" />}
            {itemId && <input type="hidden" name="item" value={itemId} />}
            <input name="q" defaultValue={q} placeholder={t("Search by product, batch no. or supplier")} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:w-80" />
          </form>
          <div className="flex gap-1">
            <a href={link("stock")} className={pill(!all)}>{t("In stock")}</a>
            <a href={link("all")} className={pill(all)}>{t("All, including used up")}</a>
          </div>
        </div>
        <Table
          head={
            <tr>
              <th>{t("Batch")}</th>
              <th>{t("Product")}</th>
              <th>{t("From")}</th>
              <th>{t("Manufactured")}</th>
              <th>{t("Expiry")}</th>
              <th className="num">{t("On hand")}</th>
              <th>{t("Test certificate")}</th>
            </tr>
          }
          empty={q ? t("No batches match.") : t("No batches yet. They appear here when a shipment is received.")}
        >
          {rows.map((b) => {
            const shipment = b.shipmentLine?.shipment;
            return (
              <tr key={b.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap">
                  <RowLink href={`/stock/batches/${b.id}`}>{batchName(b)}</RowLink>
                  {b.supplierBatchNo && <div className="text-xs text-slate-500">{b.lotNo}</div>}
                </td>
                <td>
                  <RowLink href={`/products/${b.itemId}`}>{b.item.name}</RowLink>
                  {b.item.casNumber && <div className="text-xs text-slate-500">CAS {b.item.casNumber}</div>}
                </td>
                <td className="text-sm">
                  {shipment ? (
                    <>
                      {shipment.supplier.name}
                      <div className="text-xs"><RowLink href={`/shipments/${shipment.id}`}>{shipment.ref}</RowLink> · {t.date(b.receivedDate)}</div>
                    </>
                  ) : (
                    <span className="text-slate-500">{t("Opening stock")}</span>
                  )}
                </td>
                <td className="whitespace-nowrap">{t.date(b.manufactureDate)}</td>
                <td className="whitespace-nowrap">
                  {t.date(b.expiryDate)}
                  {isExpired(b) && <span className="ms-2"><Badge color="red">{t("Expired")}</Badge></span>}
                  {expiresSoon(b) && <span className="ms-2"><Badge color="amber">{t("Expires soon")}</Badge></span>}
                </td>
                <td className="num whitespace-nowrap">{qty(b.qtyOnHand)} {t(b.item.unit)}</td>
                <td>
                  {b.certificate ? (
                    <a href={`/shipments/${b.certificate.shipmentId}/documents/${b.certificate.id}`} target="_blank" rel="noreferrer" className="text-sm text-brand-700 hover:underline">{t("Open")}</a>
                  ) : shipment ? (
                    <Badge color="amber">{t("Missing")}</Badge>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}
