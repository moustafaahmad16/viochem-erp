import Decimal from "decimal.js";
import { notFound } from "next/navigation";
import { ActionForm, Submit, TextArea } from "@/components/forms";
import { ButtonLink, Card, PageHeader, RowLink, Table } from "@/components/ui";
import { db } from "@/lib/db";
import { shareUrl } from "@/lib/eta/client";
import { money, qty } from "@/lib/format";
import { creditableLines, creditTotals } from "@/lib/services/credits";
import { prepareCreditNote } from "@/lib/services/einvoice";
import { getT } from "@/i18n/server";
import { EtaBadge, InvoiceStatusBadge } from "../../invoices/status";
import { addLine, cancelCreditNote, checkEta, deleteDraft, postCreditNote, removeLine, sendToEta } from "../actions";
import { CreditLineForm } from "./line-form";

export async function generateMetadata({ params }: PageProps<"/credit-notes/[id]">) {
  const note = await db.creditNote.findUnique({ where: { id: Number((await params).id) } });
  return { title: note?.number ?? (await getT())("Credit note") };
}

export default async function CreditNotePage({ params }: PageProps<"/credit-notes/[id]">) {
  const t = await getT();
  const id = Number((await params).id);
  const cn = await db.creditNote.findUnique({
    where: { id },
    include: {
      customer: true,
      invoice: true,
      lines: { include: { invoiceLine: { include: { item: true } }, moves: { include: { lot: true } } }, orderBy: { id: "asc" } },
    },
  });
  if (!cn) notFound();
  const isDraft = cn.status === "DRAFT";
  const totals = creditTotals(cn);
  const creditable = isDraft ? await creditableLines(cn.invoiceId, cn.id) : [];
  const sendable = cn.status === "POSTED" && ["NOT_SENT", "REJECTED", "INVALID"].includes(cn.etaStatus);
  const etaMissing = sendable ? (await prepareCreditNote(cn.id)).problems : [];
  const onEta = !!cn.etaUuid && ["SUBMITTED", "VALID"].includes(cn.etaStatus);

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3">{cn.number} <InvoiceStatusBadge status={cn.status} /></span>}
        subtitle={
          <>
            <RowLink href={`/customers/${cn.customerId}`}>{cn.customer.name}</RowLink> · {t("Credit for {number}", { number: cn.invoice.number })} · {t.date(cn.date)}
          </>
        }
        back={{ href: "/credit-notes", label: t("Credit notes") }}
        actions={!isDraft && <ButtonLink href={`/print/credit-notes/${cn.id}`} variant="secondary">{t("Print")}</ButtonLink>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card padded={false}>
            <Table
              head={<tr><th>{t("Product")}</th><th className="num">{t("Qty")}</th><th className="num">{t("Price")}</th><th className="num">{t("Amount")}</th><th>{t("Back in stock")}</th><th /></tr>}
              empty={t("No products on this credit note yet.")}
              footer={
                cn.lines.length > 0 && (
                  <>
                    <tr className="font-normal"><td colSpan={3}>{t("Subtotal")}</td><td className="num">{money(totals.net)}</td><td colSpan={2} /></tr>
                    <tr className="font-normal"><td colSpan={3}>{t("VAT {rate}%", { rate: cn.vatRate.toString() })}</td><td className="num">{money(totals.vat)}</td><td colSpan={2} /></tr>
                    <tr><td colSpan={3}>{t("Total (EGP)")}</td><td className="num">{money(totals.total)}</td><td colSpan={2} /></tr>
                  </>
                )
              }
            >
              {cn.lines.map((l) => (
                <tr key={l.id}>
                  <td>
                    {l.invoiceLine.item.name}
                    {l.moves.length > 0 && (
                      <div className="text-xs text-slate-500">
                        {l.moves.map((m) => (
                          <span key={m.id} className="me-2">
                            <RowLink href={`/stock/lots/${m.lotId}`}>{m.lot.lotNo}</RowLink> (+{qty(m.qty)})
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="num">{qty(l.qty)} {l.invoiceLine.item.unit}</td>
                  <td className="num">{money(l.unitPrice)}</td>
                  <td className="num">{money(new Decimal(l.qty.toString()).times(l.unitPrice.toString()))}</td>
                  <td>{l.restock ? t("Yes") : t("No, price only")}</td>
                  <td className="text-end">
                    {isDraft && (
                      <form action={removeLine.bind(null, cn.id, l.id)}>
                        <button className="text-xs text-slate-400 hover:text-red-600">{t("Remove")}</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
            {isDraft && (
              <div className="border-t border-slate-100 p-4">
                <CreditLineForm
                  action={addLine.bind(null, cn.id)}
                  lines={creditable.map((c) => ({
                    id: c.line.id,
                    unit: c.line.item.unit,
                    price: c.line.unitPrice.toString(),
                    remaining: c.remaining.toString(),
                    label: t("{product} · {qty} {unit} at {price} · {left} {unit} can still be credited", {
                      product: c.line.item.name,
                      qty: qty(c.line.qty),
                      unit: c.line.item.unit,
                      price: money(c.line.unitPrice),
                      left: qty(c.remaining),
                    }),
                  }))}
                />
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title={t("Reason")}>
            <p className="whitespace-pre-line text-sm text-slate-700">{cn.reason}</p>
            <p className="mt-2 text-sm text-slate-500">
              {t("Invoice")}: <RowLink href={`/invoices/${cn.invoiceId}`}>{cn.invoice.number}</RowLink> · {t.date(cn.invoice.date)}
            </p>
          </Card>
          {isDraft ? (
            <Card title={t("Post credit note")}>
              <ActionForm action={postCreditNote.bind(null, cn.id)}>
                <p className="text-sm text-slate-600">{t("Posting reduces what the customer owes and puts returned goods back into the lots they came from.")}</p>
                <Submit confirm={t("Post {number} for EGP {amount}?", { number: cn.number, amount: money(totals.total) })}>{t("Post credit note")}</Submit>
              </ActionForm>
              <form action={deleteDraft.bind(null, cn.id)} className="mt-4 border-t border-slate-100 pt-4">
                <button className="text-sm text-red-600 hover:underline">{t("Delete this draft")}</button>
              </form>
            </Card>
          ) : (
            <>
              {(cn.status === "POSTED" || cn.etaUuid) && (
                <Card title={t("E-invoice (tax authority)")} actions={<EtaBadge status={cn.etaStatus} />}>
                  <div className="space-y-3 text-sm">
                    {cn.etaUuid && cn.etaLongId && (
                      <p>
                        <a href={shareUrl(cn.etaUuid, cn.etaLongId)} target="_blank" rel="noreferrer" className="font-medium text-brand-700 hover:underline">{t("Open on the ETA portal")}</a>
                        <span className="block text-xs text-slate-500">{t("Sent {when}", { when: cn.etaSentAt?.toLocaleString(t.lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { timeZone: "Africa/Cairo", dateStyle: "medium", timeStyle: "short" }) ?? "" })}</span>
                      </p>
                    )}
                    {cn.etaError && <p className="whitespace-pre-line rounded-lg bg-red-50 p-3 text-red-800">{t.message(cn.etaError)}</p>}
                    {etaMissing.length > 0 && (
                      <div className="rounded-lg bg-amber-50 p-3 text-amber-900">
                        <p className="font-medium">{t("Before sending:")}</p>
                        <ul className="mt-1 list-disc ps-5">{etaMissing.map((m) => <li key={m}>{t.message(m)}</li>)}</ul>
                      </div>
                    )}
                    {sendable && etaMissing.length === 0 && (
                      <ActionForm action={sendToEta.bind(null, cn.id)}>
                        <Submit confirm={t("Send {number} to the tax authority?", { number: cn.number })}>{cn.etaStatus === "NOT_SENT" ? t("Send to ETA") : t("Send again")}</Submit>
                      </ActionForm>
                    )}
                    {cn.etaUuid && ["SUBMITTED", "VALID", "INVALID"].includes(cn.etaStatus) && (
                      <ActionForm action={checkEta.bind(null, cn.id)}>
                        <Submit variant="secondary">{t("Check status")}</Submit>
                      </ActionForm>
                    )}
                  </div>
                </Card>
              )}
              {cn.status === "POSTED" && (
                <Card title={t("Cancel credit note")}>
                  <ActionForm action={cancelCreditNote.bind(null, cn.id)}>
                    <p className="text-sm text-slate-600">
                      {t("The customer owes the amount again and returned goods are taken back out of stock. The number stays used.")}
                      {onEta && ` ${t("It is also cancelled at the tax authority.")}`}
                    </p>
                    {onEta && <TextArea label={t("Reason (sent to the tax authority)")} name="reason" required />}
                    <Submit variant="danger" confirm={t("Cancel {number}? This can't be undone.", { number: cn.number })}>{t("Cancel credit note")}</Submit>
                  </ActionForm>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
