import { ActionForm } from "@/components/forms";
import { Card, PageHeader, RowLink, Table } from "@/components/ui";
import { db } from "@/lib/db";
import { getT } from "@/i18n/server";
import { createCustomer } from "./actions";
import { CustomerFields } from "./fields";

export async function generateMetadata() {
  return { title: (await getT())("Customers") };
}

export default async function CustomersPage() {
  const t = await getT();
  const customers = await db.customer.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { invoices: { where: { status: "POSTED" } } } } } });
  return (
    <>
      <PageHeader title={t("Customers")} subtitle={t("{n} customers", { n: customers.length })} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <Table head={<tr><th>{t("Customer")}</th><th>{t("Phone")}</th><th className="num">{t("Invoices")}</th></tr>} empty={t("No customers yet.")}>
            {customers.map((c) => (
              <tr key={c.id}>
                <td><RowLink href={`/customers/${c.id}`}>{c.name}</RowLink></td>
                <td dir="ltr" className="text-start">{c.phone}</td>
                <td className="num">{c._count.invoices}</td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title={t("Add a customer")}>
          <ActionForm action={createCustomer} resetOnSuccess>
            <CustomerFields />
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
