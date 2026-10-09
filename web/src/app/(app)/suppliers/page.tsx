import { ActionForm } from "@/components/forms";
import { Card, PageHeader, RowLink, Table } from "@/components/ui";
import { db } from "@/lib/db";
import { getT } from "@/i18n/server";
import { createSupplier } from "./actions";
import { SupplierFields } from "./fields";

export async function generateMetadata() {
  return { title: (await getT())("Suppliers") };
}

export default async function SuppliersPage() {
  const t = await getT();
  const suppliers = await db.supplier.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { shipments: true } } } });
  return (
    <>
      <PageHeader title={t("Suppliers")} subtitle={t("{n} suppliers", { n: suppliers.length })} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <Table head={<tr><th>{t("Supplier")}</th><th>{t("Country")}</th><th>{t("Currency")}</th><th className="num">{t("Shipments")}</th></tr>} empty={t("No suppliers yet.")}>
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
        <Card title={t("Add a supplier")}>
          <ActionForm action={createSupplier} resetOnSuccess>
            <SupplierFields t={t} />
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
