import { notFound } from "next/navigation";
import { ActionForm } from "@/components/forms";
import { ButtonLink, Card, PageHeader, RowLink, Table } from "@/components/ui";
import { invoiceTotals } from "@/lib/costing";
import { formatDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { updateCustomer } from "../actions";
import { CustomerFields } from "../fields";
import { InvoiceStatusBadge } from "../../invoices/status";

export default async function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  const id = Number((await params).id);
  const c = await db.customer.findUnique({ where: { id }, include: { invoices: { orderBy: [{ date: "desc" }, { id: "desc" }], include: { lines: true } } } });
  if (!c) notFound();
  return (
    <>
      <PageHeader
        title={c.name}
        subtitle={c.taxId ? `Tax no. ${c.taxId}` : undefined}
        back={{ href: "/customers", label: "Customers" }}
        actions={<ButtonLink href={`/invoices/new?customer=${c.id}`}>New invoice</ButtonLink>}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Invoices" padded={false} className="lg:col-span-2">
          <Table head={<tr><th>Invoice</th><th>Date</th><th>Status</th><th className="num">Total (EGP)</th></tr>} empty="No invoices yet.">
            {c.invoices.map((i) => (
              <tr key={i.id}>
                <td><RowLink href={`/invoices/${i.id}`}>{i.number}</RowLink></td>
                <td>{formatDate(i.date)}</td>
                <td><InvoiceStatusBadge status={i.status} /></td>
                <td className="num">{money(invoiceTotals(i.lines, i.vatRate.toString()).total)}</td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Details">
          <ActionForm action={updateCustomer.bind(null, c.id)}>
            <CustomerFields c={c} />
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
