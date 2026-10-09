import type { PurchaseOrderStatus } from "@prisma/client";
import { ButtonLink, Card, PageHeader, RowLink, Table } from "@/components/ui";
import { db } from "@/lib/db";
import { money, pct } from "@/lib/format";
import { orderProgress } from "@/lib/services/orders";
import { getT } from "@/i18n/server";
import { OrderStatusBadge } from "./status";

export async function generateMetadata() {
  return { title: (await getT())("Purchase orders") };
}

const FILTERS = [
  { key: "", label: "Open" },
  { key: "CLOSED", label: "Closed" },
  { key: "CANCELLED", label: "Cancelled" },
  { key: "all", label: "All" },
] as const;

export default async function PurchaseOrdersPage({ searchParams }: PageProps<"/purchase-orders">) {
  const t = await getT();
  const status = String((await searchParams).status ?? "");
  const where = status === "all" ? {} : { status: (status === "CLOSED" || status === "CANCELLED" ? status : "OPEN") as PurchaseOrderStatus };
  const orders = await db.purchaseOrder.findMany({
    where,
    include: { supplier: true, lines: { include: { shipmentLines: true } } },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: 200,
  });

  return (
    <>
      <PageHeader
        title={t("Purchase orders")}
        subtitle={t("What you've ordered from suppliers. Nothing is owed until the goods are put on a shipment.")}
        actions={<ButtonLink href="/purchase-orders/new">{t("New purchase order")}</ButtonLink>}
      />
      <div className="mb-3 flex gap-1">
        {FILTERS.map((f) => (
          <a
            key={f.key}
            href={f.key ? `/purchase-orders?status=${f.key}` : "/purchase-orders"}
            className={`rounded-full px-3 py-1 text-sm ${status === f.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-200"}`}
          >
            {t(f.label)}
          </a>
        ))}
      </div>
      <Card padded={false}>
        <Table
          head={
            <tr>
              <th>{t("Order")}</th>
              <th>{t("Supplier")}</th>
              <th>{t("Date")}</th>
              <th>{t("Expected")}</th>
              <th className="num">{t("Total")}</th>
              <th className="num">{t("Shipped")}</th>
              <th>{t("Status")}</th>
            </tr>
          }
          empty={t("No purchase orders here.")}
        >
          {orders.map((o) => {
            const p = orderProgress(o);
            return (
              <tr key={o.id} className="hover:bg-slate-50">
                <td><RowLink href={`/purchase-orders/${o.id}`}>{o.number}</RowLink></td>
                <td>{o.supplier.name}</td>
                <td>{t.date(o.date)}</td>
                <td>{t.date(o.expectedDate)}</td>
                <td className="num">{o.currency} {money(p.value)}</td>
                <td className="num">{pct(p.percentShipped)}</td>
                <td><OrderStatusBadge status={o.status} /></td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}
