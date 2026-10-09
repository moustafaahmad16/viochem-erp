import { notFound } from "next/navigation";
import { ActionForm, Field, Select, Submit } from "@/components/forms";
import { Card, Detail, PageHeader, RowLink } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { toInputDate, today } from "@/lib/dates";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { getT } from "@/i18n/server";
import { accountOptions } from "../../payments/parts";
import { bounceCheque, clearCheque, deleteCheque, depositCheque, reopenCheque } from "../actions";
import { ChequeStatusBadge } from "../status";

export async function generateMetadata({ params }: PageProps<"/cheques/[id]">) {
  const c = await db.cheque.findUnique({ where: { id: Number((await params).id) } });
  return { title: c ? c.number : (await getT())("Cheques") };
}

export default async function ChequePage({ params }: PageProps<"/cheques/[id]">) {
  const t = await getT();
  const id = Number((await params).id);
  const c = await db.cheque.findUnique({ where: { id }, include: { customer: true, supplier: true, invoice: true, shipment: true, account: true } });
  if (!c) notFound();
  const [user, banks] = await Promise.all([currentUser(), c.direction === "RECEIVED" && c.status === "PENDING" ? accountOptions({ egpOnly: true }) : Promise.resolve([])]);
  const received = c.direction === "RECEIVED";
  const now = toInputDate(today());
  const dateField = <Field label={t("Date")} name="date" type="date" defaultValue={now} required />;
  const canClear = (received && c.status === "DEPOSITED") || (!received && c.status === "PENDING");
  const canBounce = c.status === "PENDING" || c.status === "DEPOSITED";

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3">{c.number} <ChequeStatusBadge status={c.status} direction={c.direction} /></span>}
        subtitle={
          <>
            {received ? t("Cheque from") : t("Cheque to")}{" "}
            {c.customer && <RowLink href={`/customers/${c.customerId}`}>{c.customer.name}</RowLink>}
            {c.supplier && <RowLink href={`/suppliers/${c.supplierId}`}>{c.supplier.name}</RowLink>} · EGP {money(c.amount)}
          </>
        }
        back={{ href: received ? "/cheques" : "/cheques?tab=issued", label: t("Cheques") }}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={t("Details")}>
            <dl className="grid gap-4 sm:grid-cols-3">
              <Detail label={t("Cheque number")}><span className="font-mono">{c.chequeNo}</span></Detail>
              <Detail label={t("Bank")}>{c.bank}</Detail>
              <Detail label={t("Amount (EGP)")}>{money(c.amount)}</Detail>
              <Detail label={received ? t("Received on") : t("Written on")}>{t.date(c.date)}</Detail>
              <Detail label={t("Date on the cheque")}>{t.date(c.dueDate)}</Detail>
              <Detail label={received ? t("Deposited into") : t("Drawn on")}>{c.account && <RowLink href={`/accounts/${c.accountId}`}>{c.account.name}</RowLink>}</Detail>
              {c.depositedOn && <Detail label={t("Deposited on")}>{t.date(c.depositedOn)}</Detail>}
              {c.clearedOn && <Detail label={received ? t("Cleared on") : t("Cashed on")}>{t.date(c.clearedOn)}</Detail>}
              {c.bouncedOn && <Detail label={received ? t("Bounced on") : t("Returned on")}>{t.date(c.bouncedOn)}</Detail>}
              {c.invoice && <Detail label={t("For invoice")}><RowLink href={`/invoices/${c.invoiceId}`}>{c.invoice.number}</RowLink></Detail>}
              {c.shipment && <Detail label={t("For shipment")}><RowLink href={`/shipments/${c.shipmentId}`}>{c.shipment.ref}</RowLink></Detail>}
            </dl>
            {c.notes && <p className="mt-4 whitespace-pre-line border-t border-slate-100 pt-4 text-sm text-slate-700">{c.notes}</p>}
          </Card>
          <Card title={t("What this means")}>
            <p className="text-sm text-slate-600">
              {received
                ? c.status === "BOUNCED"
                  ? t("The cheque bounced, so the customer owes this amount again.")
                  : c.status === "CLEARED"
                    ? t("The money is in the bank.")
                    : t("The customer's balance already counts this cheque as paid. The money reaches the bank when it clears.")
                : c.status === "BOUNCED"
                  ? t("The cheque came back unpaid, so we owe the supplier this amount again.")
                  : c.status === "CLEARED"
                    ? t("The money has left the bank.")
                    : t("The supplier's balance already counts this cheque as paid. The money leaves the bank when it is cashed.")}
            </p>
          </Card>
        </div>
        <div className="space-y-6">
          {received && c.status === "PENDING" && (
            <Card title={t("Deposit at the bank")}>
              <ActionForm action={depositCheque.bind(null, c.id)}>
                <Select label={t("Into account")} name="accountId" defaultValue={banks[0]?.value ?? ""} options={banks} placeholder={t("Choose…")} required />
                {dateField}
                <Submit>{t("Deposit")}</Submit>
              </ActionForm>
            </Card>
          )}
          {canClear && (
            <Card title={received ? t("Mark as cleared") : t("Mark as cashed")}>
              <ActionForm action={clearCheque.bind(null, c.id)}>
                <p className="text-sm text-slate-600">{received ? t("When the money shows on the bank statement.") : t("When the money leaves our bank account.")}</p>
                {dateField}
                <Submit>{received ? t("Mark as cleared") : t("Mark as cashed")}</Submit>
              </ActionForm>
            </Card>
          )}
          {canBounce && (
            <Card title={received ? t("Cheque bounced") : t("Cheque returned unpaid")}>
              <ActionForm action={bounceCheque.bind(null, c.id)}>
                <p className="text-sm text-slate-600">{received ? t("The customer will owe the amount again.") : t("We will owe the supplier the amount again.")}</p>
                {dateField}
                <Submit variant="danger" confirm={t("Mark {number} as bounced?", { number: c.number })}>{received ? t("Mark as bounced") : t("Mark as returned")}</Submit>
              </ActionForm>
            </Card>
          )}
          {c.status !== "PENDING" && user?.role === "ADMIN" && (
            <Card title={t("Undo")}>
              <ActionForm action={reopenCheque.bind(null, c.id)}>
                <p className="text-sm text-slate-600">{t("Puts the cheque back to pending, as if nothing had happened since it was recorded. Use it to correct a mistake.")}</p>
                <Submit variant="secondary" confirm={t("Put {number} back to pending?", { number: c.number })}>{t("Back to pending")}</Submit>
              </ActionForm>
            </Card>
          )}
          {c.status === "PENDING" && (
            <Card title={t("Delete")}>
              <ActionForm action={deleteCheque.bind(null, c.id)}>
                <p className="text-sm text-slate-600">{t("Only if it was recorded by mistake.")}</p>
                <Submit variant="danger" confirm={t("Delete {number}? This can't be undone.", { number: c.number })}>{t("Delete cheque")}</Submit>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
