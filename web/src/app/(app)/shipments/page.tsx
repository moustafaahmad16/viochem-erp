import Decimal from "decimal.js";
import { ButtonLink, Card, PageHeader, RowLink, Table } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { StatusBadge } from "./status";

export const metadata = { title: "Shipments" };

export default async function ShipmentsPage() {
  const shipments = await db.shipment.findMany({
    include: { supplier: true, lines: true, charges: true },
    orderBy: [{ orderDate: "desc" }, { id: "desc" }],
  });
  const open = shipments.filter((s) => s.status !== "RECEIVED").length;

  return (
    <>
      <PageHeader title="Import shipments" subtitle={`${open} on the way`} actions={<ButtonLink href="/shipments/new">New shipment</ButtonLink>} />
      <Card padded={false}>
        <Table
          head={<tr><th>Shipment</th><th>Supplier</th><th>Ordered</th><th>Expected</th><th>Status</th><th className="num">Landed cost (EGP)</th></tr>}
          empty="No shipments yet. Create one when you place an order with a supplier."
        >
          {shipments.map((s) => {
            const goods = s.lines.reduce((t, l) => t.plus(new Decimal(l.qty.toString()).times(l.unitPrice.toString())), new Decimal(0)).times(s.fxRate.toString());
            const total = s.charges.reduce((t, c) => t.plus(c.amountEgp.toString()), goods);
            return (
              <tr key={s.id} className="hover:bg-slate-50">
                <td>
                  <RowLink href={`/shipments/${s.id}`}>{s.ref}</RowLink>
                  {s.supplierInvoiceNo && <div className="text-xs text-slate-500">Inv. {s.supplierInvoiceNo}</div>}
                </td>
                <td>{s.supplier.name}</td>
                <td>{formatDate(s.orderDate)}</td>
                <td>{s.status === "RECEIVED" ? formatDate(s.arrivalDate) : formatDate(s.eta)}</td>
                <td><StatusBadge status={s.status} /></td>
                <td className="num">{money(total)}</td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}
