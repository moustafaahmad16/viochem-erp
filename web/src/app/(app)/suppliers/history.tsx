import { Card, RowLink, Table } from "@/components/ui";
import { TabPills } from "@/components/tabs";
import { db } from "@/lib/db";
import { money, pct } from "@/lib/format";
import { orderProgress } from "@/lib/services/orders";
import type { getT } from "@/i18n/server";
import { ChequeStatusBadge } from "../cheques/status";
import { OrderStatusBadge } from "../purchase-orders/status";
import { RfqStatusBadge } from "../rfqs/status";
import { StatusBadge } from "../shipments/status";

type T = Awaited<ReturnType<typeof getT>>;

/** Everything done with one supplier, a tab per kind of document. */
export async function SupplierHistory({ supplierId, tab, t }: { supplierId: number; tab: string; t: T }) {
  const where = { supplierId };
  const [shipments, orders, rfqs, cheques] = await Promise.all([
    db.shipment.findMany({ where, include: { purchaseOrder: true }, orderBy: [{ orderDate: "desc" }, { id: "desc" }] }),
    db.purchaseOrder.findMany({ where, include: { lines: { include: { shipmentLines: true } } }, orderBy: [{ date: "desc" }, { id: "desc" }] }),
    db.rfqSupplier.findMany({ where, include: { rfq: true }, orderBy: { rfq: { date: "desc" } } }),
    db.cheque.findMany({ where, orderBy: [{ dueDate: "desc" }, { id: "desc" }] }),
  ]);
  const tabs = [
    { key: "", label: t("Shipments"), count: shipments.length },
    { key: "orders", label: t("Purchase orders"), count: orders.length },
    { key: "rfqs", label: t("Requests for quotation"), count: rfqs.length },
    { key: "cheques", label: t("Cheques"), count: cheques.length },
  ];
  const current = tabs.some((x) => x.key === tab) ? tab : "";

  return (
    <Card title={<span id="history">{t("History")}</span>} padded={false}>
      <div className="border-b border-slate-100 px-5 py-3">
        <TabPills tabs={tabs} current={current} href={(k) => `/suppliers/${supplierId}${k ? `?tab=${k}` : ""}#history`} />
      </div>
      {current === "orders" ? (
        <Table head={<tr><th>{t("Order")}</th><th>{t("Date")}</th><th>{t("Expected")}</th><th className="num">{t("Total")}</th><th className="num">{t("Shipped")}</th><th>{t("Status")}</th></tr>} empty={t("No purchase orders to this supplier yet.")}>
          {orders.map((o) => {
            const p = orderProgress(o);
            return (
              <tr key={o.id}>
                <td><RowLink href={`/purchase-orders/${o.id}`}>{o.number}</RowLink></td>
                <td>{t.date(o.date)}</td>
                <td>{t.date(o.expectedDate)}</td>
                <td className="num">{o.currency} {money(p.value)}</td>
                <td className="num">{pct(p.percentShipped)}</td>
                <td><OrderStatusBadge status={o.status} /></td>
              </tr>
            );
          })}
        </Table>
      ) : current === "rfqs" ? (
        <Table head={<tr><th>{t("Request")}</th><th>{t("Date")}</th><th>{t("Reply by")}</th><th>{t("Replied")}</th><th>{t("Status")}</th></tr>} empty={t("No requests for quotation sent to this supplier yet.")}>
          {rfqs.map((r) => (
            <tr key={r.id}>
              <td><RowLink href={`/rfqs/${r.rfqId}`}>{r.rfq.number}</RowLink></td>
              <td>{t.date(r.rfq.date)}</td>
              <td>{t.date(r.rfq.replyBy)}</td>
              <td>{r.repliedAt ? t.date(r.repliedAt) : <span className="text-slate-400">{t("Not yet")}</span>}</td>
              <td><RfqStatusBadge status={r.rfq.status} /></td>
            </tr>
          ))}
        </Table>
      ) : current === "cheques" ? (
        <Table head={<tr><th>{t("Cheque")}</th><th>{t("Cheque no.")}</th><th>{t("Bank")}</th><th>{t("Due")}</th><th>{t("Status")}</th><th className="num">{t("Amount (EGP)")}</th></tr>} empty={t("No cheques written to this supplier.")}>
          {cheques.map((c) => (
            <tr key={c.id}>
              <td><RowLink href={`/cheques/${c.id}`}>{c.number}</RowLink></td>
              <td className="font-mono">{c.chequeNo}</td>
              <td>{c.bank}</td>
              <td>{t.date(c.dueDate)}</td>
              <td><ChequeStatusBadge status={c.status} direction={c.direction} /></td>
              <td className="num">{money(c.amount)}</td>
            </tr>
          ))}
        </Table>
      ) : (
        <Table head={<tr><th>{t("Shipment")}</th><th>{t("Ordered")}</th><th>{t("Purchase order")}</th><th>{t("Status")}</th></tr>} empty={t("No shipments from this supplier yet.")}>
          {shipments.map((sh) => (
            <tr key={sh.id}>
              <td><RowLink href={`/shipments/${sh.id}`}>{sh.ref}</RowLink></td>
              <td>{t.date(sh.orderDate)}</td>
              <td>{sh.purchaseOrder && <RowLink href={`/purchase-orders/${sh.purchaseOrder.id}`}>{sh.purchaseOrder.number}</RowLink>}</td>
              <td><StatusBadge status={sh.status} /></td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}
