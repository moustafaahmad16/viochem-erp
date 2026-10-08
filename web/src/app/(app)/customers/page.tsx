import { ActionForm } from "@/components/forms";
import { Card, PageHeader, RowLink, Table } from "@/components/ui";
import { db } from "@/lib/db";
import { createCustomer } from "./actions";
import { CustomerFields } from "./fields";

export const metadata = { title: "Customers" };

export default async function CustomersPage() {
  const customers = await db.customer.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { invoices: { where: { status: "POSTED" } } } } } });
  return (
    <>
      <PageHeader title="Customers" subtitle={`${customers.length} customers`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <Table head={<tr><th>Customer</th><th>Phone</th><th className="num">Invoices</th></tr>} empty="No customers yet.">
            {customers.map((c) => (
              <tr key={c.id}>
                <td><RowLink href={`/customers/${c.id}`}>{c.name}</RowLink></td>
                <td>{c.phone}</td>
                <td className="num">{c._count.invoices}</td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Add a customer">
          <ActionForm action={createCustomer} resetOnSuccess>
            <CustomerFields />
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
