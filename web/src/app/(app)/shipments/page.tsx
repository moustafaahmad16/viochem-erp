import Decimal from "decimal.js";
import { ButtonLink, Card, PageHeader, RowLink, Table } from "@/components/ui";
import { db } from "@/lib/db";
import { getT } from "@/i18n/server";
import { money } from "@/lib/format";
import { StatusBadge } from "./status";

export async function generateMetadata() {
  return { title: (await getT())("Shipments") };
}

export default async function ShipmentsPage() {
  const shipments = await db.shipment.findMany({
    include: { supplier: true, lines: true, charges: true },
    orderBy: [{ orderDate: "desc" }, { id: "desc" }],
  });
  const t = await getT();
  const open = shipments.filter((s) => s.status !== "RECEIVED").length;

  return (
    <>
      <PageHeader title={t("Import shipments")} subtitle={t("{n} on the way", { n: open })} actions={<ButtonLink href="/shipments/new">{t("New shipment")}</ButtonLink>} />
      <Card padded={false}>
        <Table
          head={<tr><th>{t("Shipment")}</th><th>{t("Supplier")}</th><th>{t("Ordered")}</th><th>{t("Expected")}</th><th>{t("Status")}</th><th className="num">{t("Landed cost (EGP)")}</th></tr>}
          empty={t("No shipments yet. Create one when you place an order with a supplier.")}
        >
          {shipments.map((s) => {
            const goods = s.lines.reduce((sum, l) => sum.plus(new Decimal(l.qty.toString()).times(l.unitPrice.toString())), new Decimal(0)).times(s.fxRate.toString());
            const total = s.charges.reduce((sum, c) => sum.plus(c.amountEgp.toString()), goods);
            return (
              <tr key={s.id} className="hover:bg-slate-50">
                <td>
                  <RowLink href={`/shipments/${s.id}`}>{s.ref}</RowLink>
                  {s.supplierInvoiceNo && <div className="text-xs text-slate-500">{t("Inv. {no}", { no: s.supplierInvoiceNo })}</div>}
                </td>
                <td>{s.supplier.name}</td>
                <td>{t.date(s.orderDate)}</td>
                <td>{s.status === "RECEIVED" ? t.date(s.arrivalDate) : t.date(s.eta)}</td>
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
