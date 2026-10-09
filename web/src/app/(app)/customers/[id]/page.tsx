import { notFound } from "next/navigation";
import { ActionForm } from "@/components/forms";
import { ButtonLink, Card, PageHeader, RowLink, Stat, Table } from "@/components/ui";
import { invoiceTotals } from "@/lib/costing";
import { currentUser } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { customerAccounts } from "@/lib/services/accounts";
import { updateCustomer } from "../actions";
import { CustomerFields } from "../fields";
import { InvoiceStatusBadge } from "../../invoices/status";
import { deleteCustomerPayment, receivePayment } from "../../payments/actions";
import { accountOptions, Balance, OpenBills, ReceivePaymentForm, Statement } from "../../payments/parts";

export default async function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  const id = Number((await params).id);
  const [acc] = await customerAccounts({ id });
  if (!acc) notFound();
  const c = acc.customer;
  const [drafts, user, accounts] = await Promise.all([
    db.invoice.findMany({ where: { customerId: id, status: { not: "POSTED" } }, include: { lines: true }, orderBy: [{ date: "desc" }, { id: "desc" }] }),
    currentUser(),
    accountOptions({ egpOnly: true }),
  ]);
  const deletes = user?.role === "ADMIN" ? new Map(acc.payments.map((p) => [p.number, deleteCustomerPayment.bind(null, p.id)])) : undefined;

  return (
    <>
      <PageHeader
        title={c.name}
        subtitle={[c.taxId && `Tax no. ${c.taxId}`, c.paymentTermsDays ? `Pays within ${c.paymentTermsDays} days` : "Cash on delivery"].filter(Boolean).join(" · ")}
        back={{ href: "/customers", label: "Customers" }}
        actions={
          <>
            <ButtonLink href={`/print/statements/${c.id}`} variant="secondary">Print statement</ButtonLink>
            <ButtonLink href={`/invoices/new?customer=${c.id}`}>New invoice</ButtonLink>
          </>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Balance" value={<Balance value={acc.balance} currency="EGP" />} />
        <Stat label="Overdue" value={`EGP ${money(acc.overdue)}`} tone={acc.overdue.gt(0) ? "warn" : "default"} />
        <Stat label="Payment terms" value={`${c.paymentTermsDays} days`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Unpaid invoices" padded={false}>
            <OpenBills account={acc} />
          </Card>
          <Card title="Statement" padded={false}>
            <Statement account={acc} onDelete={deletes} />
          </Card>
          {drafts.length > 0 && (
            <Card title="Drafts and cancelled invoices" padded={false}>
              <Table head={<tr><th>Invoice</th><th>Date</th><th>Status</th><th className="num">Total (EGP)</th></tr>}>
                {drafts.map((i) => (
                  <tr key={i.id}>
                    <td><RowLink href={`/invoices/${i.id}`}>{i.number}</RowLink></td>
                    <td>{formatDate(i.date)}</td>
                    <td><InvoiceStatusBadge status={i.status} /></td>
                    <td className="num">{money(invoiceTotals(i.lines, i.vatRate.toString()).total)}</td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <Card title="Receive a payment">
            <ReceivePaymentForm action={receivePayment.bind(null, c.id)} bills={acc.bills} accounts={accounts} />
          </Card>
          <Card title="Details">
            <ActionForm action={updateCustomer.bind(null, c.id)}>
              <CustomerFields c={c} />
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
