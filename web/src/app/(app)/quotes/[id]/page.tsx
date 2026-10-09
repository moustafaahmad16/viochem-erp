import Decimal from "decimal.js";
import { notFound } from "next/navigation";
import { ActionForm, Field, Select, Submit, TextArea } from "@/components/forms";
import { ButtonLink, Card, PageHeader, RowLink, Table } from "@/components/ui";
import { invoiceTotals } from "@/lib/costing";
import { toInputDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { money, qty } from "@/lib/format";
import { isExpired } from "@/lib/services/quotes";
import { getT } from "@/i18n/server";
import { addLine, declineQuote, deleteQuote, removeLine, reopenQuote, toInvoice, updateQuote } from "../actions";
import { QuoteStatusBadge } from "../status";
import { QuoteLineForm } from "./line-form";

export async function generateMetadata({ params }: PageProps<"/quotes/[id]">) {
  const q = await db.quote.findUnique({ where: { id: Number((await params).id) || 0 } });
  return { title: q?.number ?? (await getT())("Quotation") };
}

export default async function QuotePage({ params }: PageProps<"/quotes/[id]">) {
  const t = await getT();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const q = await db.quote.findUnique({
    where: { id },
    include: { customer: true, invoice: true, lines: { include: { item: true }, orderBy: { id: "asc" } } },
  });
  if (!q) notFound();
  const isOpen = q.status === "OPEN";
  const expired = isExpired(q);
  const totals = invoiceTotals(q.lines, q.vatRate.toString());

  const [items, customers] = isOpen
    ? await Promise.all([
        db.item.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
        db.customer.findMany({ orderBy: { name: "asc" } }),
      ])
    : [[], []];

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3">{q.number} <QuoteStatusBadge status={q.status} validUntil={q.validUntil} /></span>}
        subtitle={
          <>
            <RowLink href={`/customers/${q.customerId}`}>{q.customer.name}</RowLink> · {t.date(q.date)}
            {q.validUntil && ` · ${t("Valid until {date}", { date: t.date(q.validUntil) })}`}
          </>
        }
        back={{ href: "/quotes", label: t("Quotations") }}
        actions={q.lines.length > 0 && <ButtonLink href={`/print/quotes/${q.id}`} variant="secondary">{t("Print")}</ButtonLink>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card padded={false}>
            <Table
              head={<tr><th>{t("Product")}</th><th className="num">{t("Qty")}</th><th className="num">{t("Price")}</th><th className="num">{t("Amount")}</th><th /></tr>}
              empty={t("No products on this quotation yet.")}
              footer={
                q.lines.length > 0 && (
                  <>
                    <tr className="font-normal"><td colSpan={3}>{t("Subtotal")}</td><td className="num">{money(totals.net)}</td><td /></tr>
                    <tr className="font-normal"><td colSpan={3}>{t("VAT {rate}%", { rate: q.vatRate.toString() })}</td><td className="num">{money(totals.vat)}</td><td /></tr>
                    <tr><td colSpan={3}>{t("Total (EGP)")}</td><td className="num">{money(totals.total)}</td><td /></tr>
                  </>
                )
              }
            >
              {q.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.item.name}</td>
                  <td className="num">{qty(l.qty)} {l.item.unit}</td>
                  <td className="num">{money(l.unitPrice)}</td>
                  <td className="num">{money(new Decimal(l.qty.toString()).times(l.unitPrice.toString()))}</td>
                  <td className="text-end">
                    {isOpen && (
                      <form action={removeLine.bind(null, q.id, l.id)}>
                        <button className="text-xs text-slate-400 hover:text-red-600">{t("Remove")}</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
            {isOpen && (
              <div className="border-t border-slate-100 p-4">
                <QuoteLineForm action={addLine.bind(null, q.id)} items={items.map((i) => ({ id: i.id, label: `${i.name} (${i.code})`, unit: i.unit }))} />
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {isOpen && (
            <>
              <Card title={t("Turn into invoice")}>
                <ActionForm action={toInvoice.bind(null, q.id)}>
                  <p className="text-sm text-slate-600">{t("Makes a draft invoice dated today with these products and prices. You can still change the draft before posting it.")}</p>
                  {expired && <p className="text-sm text-amber-800">{t("This quotation has expired. Check the prices are still right.")}</p>}
                  <Submit confirm={t("Turn {number} into an invoice?", { number: q.number })}>{t("Turn into invoice")}</Submit>
                </ActionForm>
              </Card>
              <Card title={t("Details")}>
                <ActionForm action={updateQuote.bind(null, q.id)}>
                  <Select label={t("Customer")} name="customerId" defaultValue={q.customerId} options={customers.map((c) => ({ value: c.id, label: c.name }))} />
                  <Field label={t("Quotation date")} name="date" type="date" defaultValue={toInputDate(q.date)} required />
                  <Field label={t("Valid until")} name="validUntil" type="date" defaultValue={toInputDate(q.validUntil)} />
                  <Field label={t("VAT %")} name="vatRate" defaultValue={q.vatRate.toString()} inputMode="decimal" required />
                  <TextArea label={t("Notes (printed on the quotation)")} name="notes" defaultValue={q.notes ?? ""} />
                  <Submit variant="secondary">{t("Save")}</Submit>
                </ActionForm>
              </Card>
              <Card title={t("Customer said no?")}>
                <div className="space-y-4">
                  <ActionForm action={declineQuote.bind(null, q.id)}>
                    <p className="text-sm text-slate-600">{t("Keep it on record as declined. You can reopen it later.")}</p>
                    <Submit variant="secondary">{t("Mark as declined")}</Submit>
                  </ActionForm>
                  <ActionForm action={deleteQuote.bind(null, q.id)} className="border-t border-slate-100 pt-4">
                    <Submit variant="danger" confirm={t("Delete {number}? This can't be undone.", { number: q.number })}>{t("Delete this quotation")}</Submit>
                  </ActionForm>
                </div>
              </Card>
            </>
          )}
          {q.status === "ACCEPTED" && q.invoice && (
            <Card title={t("Invoice")}>
              <p className="text-sm text-slate-600">
                {t("Turned into invoice")} <RowLink href={`/invoices/${q.invoice.id}`}>{q.invoice.number}</RowLink>
              </p>
            </Card>
          )}
          {q.status === "DECLINED" && (
            <Card title={t("Declined")}>
              <ActionForm action={reopenQuote.bind(null, q.id)}>
                <p className="text-sm text-slate-600">{t("The customer turned this down. Reopen it to change it or turn it into an invoice.")}</p>
                <Submit variant="secondary">{t("Reopen")}</Submit>
              </ActionForm>
            </Card>
          )}
          {!isOpen && q.notes && <Card title={t("Notes")}><p className="whitespace-pre-line text-sm text-slate-700">{q.notes}</p></Card>}
        </div>
      </div>
    </>
  );
}
