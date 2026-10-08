import { ActionForm } from "@/components/forms";
import { Card, PageHeader, RowLink, Table } from "@/components/ui";
import { db } from "@/lib/db";
import { createSupplier } from "./actions";
import { SupplierFields } from "./fields";

export const metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  const suppliers = await db.supplier.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { shipments: true } } } });
  return (
    <>
      <PageHeader title="Suppliers" subtitle={`${suppliers.length} suppliers`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <Table head={<tr><th>Supplier</th><th>Country</th><th>Currency</th><th className="num">Shipments</th></tr>} empty="No suppliers yet.">
            {suppliers.map((s) => (
              <tr key={s.id}>
                <td><RowLink href={`/suppliers/${s.id}`}>{s.name}</RowLink></td>
                <td>{s.country}</td>
                <td>{s.currency}</td>
                <td className="num">{s._count.shipments}</td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Add a supplier">
          <ActionForm action={createSupplier} resetOnSuccess>
            <SupplierFields />
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
