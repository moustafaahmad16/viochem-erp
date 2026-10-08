import { notFound } from "next/navigation";
import { ActionForm } from "@/components/forms";
import { Card, PageHeader, RowLink, Table } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { updateSupplier } from "../actions";
import { SupplierFields } from "../fields";
import { StatusBadge } from "../../shipments/status";

export default async function SupplierPage({ params }: PageProps<"/suppliers/[id]">) {
  const id = Number((await params).id);
  const s = await db.supplier.findUnique({ where: { id }, include: { shipments: { orderBy: { orderDate: "desc" } } } });
  if (!s) notFound();
  return (
    <>
      <PageHeader title={s.name} subtitle={[s.country, s.currency].filter(Boolean).join(" · ")} back={{ href: "/suppliers", label: "Suppliers" }} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Shipments" padded={false} className="lg:col-span-2">
          <Table head={<tr><th>Shipment</th><th>Ordered</th><th>Status</th></tr>} empty="No shipments from this supplier yet.">
            {s.shipments.map((sh) => (
              <tr key={sh.id}>
                <td><RowLink href={`/shipments/${sh.id}`}>{sh.ref}</RowLink></td>
                <td>{formatDate(sh.orderDate)}</td>
                <td><StatusBadge status={sh.status} /></td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Details">
          <ActionForm action={updateSupplier.bind(null, s.id)}>
            <SupplierFields s={s} />
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
