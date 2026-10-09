import Decimal from "decimal.js";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/forms";
import { ButtonLink, Card, PageHeader, RowLink, Stat, Table } from "@/components/ui";
import { invoiceTotals } from "@/lib/costing";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { customerAccounts } from "@/lib/services/accounts";
import { getT } from "@/i18n/server";
import { updateCustomer } from "../actions";
import { CustomerFields } from "../fields";
import { PendingCheques } from "../../cheques/pending";
import { InvoiceStatusBadge } from "../../invoices/status";
import { deleteCustomerPayment, receivePayment } from "../../payments/actions";
import { accountOptions, Balance, OpenBills, ReceivePaymentForm, Statement } from "../../payments/parts";

export default async function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  const t = await getT();
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
        subtitle={[c.taxId && t("Tax no. {taxId}", { taxId: c.taxId }), c.paymentTermsDays ? t("Pays within {n} days", { n: c.paymentTermsDays }) : t("Cash on delivery")].filter(Boolean).join(" · ")}
        back={{ href: "/customers", label: t("Customers") }}
        actions={
          <>
            <ButtonLink href={`/print/statements/${c.id}`} variant="secondary">{t("Print statement")}</ButtonLink>
            <ButtonLink href={`/quotes/new?customer=${c.id}`} variant="secondary">{t("New quotation")}</ButtonLink>
            <ButtonLink href={`/invoices/new?customer=${c.id}`}>{t("New invoice")}</ButtonLink>
          </>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("Balance")} value={<Balance value={acc.balance} currency="EGP" />} />
        <Stat label={t("Overdue")} value={`EGP ${money(acc.overdue)}`} tone={acc.overdue.gt(0) ? "warn" : "default"} />
        <Stat label={t("Payment terms")} value={t("{n} days", { n: c.paymentTermsDays })} />
        <Stat
          label={t("Credit limit")}
          value={c.creditLimit ? `EGP ${money(c.creditLimit)}` : t("No limit")}
          hint={c.creditLimit ? (acc.balance.gt(c.creditLimit.toString()) ? t("Over the limit") : t("EGP {amount} still available", { amount: money(new Decimal(c.creditLimit.toString()).minus(acc.balance)) })) : undefined}
          tone={c.creditLimit && acc.balance.gt(c.creditLimit.toString()) ? "warn" : "default"}
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={t("Unpaid invoices")} padded={false}>
            <OpenBills account={acc} />
          </Card>
          <Card title={t("Statement")} padded={false}>
            <Statement account={acc} onDelete={deletes} />
          </Card>
          {drafts.length > 0 && (
            <Card title={t("Drafts and cancelled invoices")} padded={false}>
              <Table head={<tr><th>{t("Invoice")}</th><th>{t("Date")}</th><th>{t("Status")}</th><th className="num">{t("Total (EGP)")}</th></tr>}>
                {drafts.map((i) => (
                  <tr key={i.id}>
                    <td><RowLink href={`/invoices/${i.id}`}>{i.number}</RowLink></td>
                    <td>{t.date(i.date)}</td>
                    <td><InvoiceStatusBadge status={i.status} /></td>
                    <td className="num">{money(invoiceTotals(i.lines, i.vatRate.toString()).total)}</td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <PendingCheques customerId={c.id} />
          <Card title={t("Receive a payment")}>
            <ReceivePaymentForm action={receivePayment.bind(null, c.id)} bills={acc.bills} accounts={accounts} />
          </Card>
          <Card title={t("Details")}>
            <ActionForm action={updateCustomer.bind(null, c.id)}>
              <CustomerFields c={c} />
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
