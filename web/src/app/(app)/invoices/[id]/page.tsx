import Decimal from "decimal.js";
import { notFound } from "next/navigation";
import { ActionForm, Field, Select, Submit, TextArea } from "@/components/forms";
import { Badge, ButtonLink, Card, PageHeader, RowLink, Table } from "@/components/ui";
import { invoiceTotals } from "@/lib/costing";
import { toInputDate, today } from "@/lib/dates";
import { db } from "@/lib/db";
import { money, pct, qty } from "@/lib/format";
import { daysLate } from "@/lib/ledger";
import { customerAccounts } from "@/lib/services/accounts";
import { creditCheck } from "@/lib/services/credit";
import { currentUser } from "@/lib/auth";
import { addLine, cancelInvoice, checkEta, deleteDraft, postInvoice, removeLine, updateInvoice, updateLine } from "../actions";
import { EtaBadge, InvoiceNumber, InvoiceStatusBadge } from "../status";
import { etaSettings, prepare } from "@/lib/services/einvoice";
import { EtaSend } from "@/components/eta-send";
import { shareUrl, signingMode } from "@/lib/eta/client";
import { getT } from "@/i18n/server";
import { batchName, expiresSoon, isExpired } from "@/lib/services/batches";
import { LineForm } from "./line-form";
import { InvoiceCreditNotes } from "../../credit-notes/invoice-card";
import { creditTotals } from "@/lib/services/credits";
import { isDraftNumber } from "@/lib/services/invoice-numbers";
import { availability, NOTHING, shortages } from "@/lib/services/reservations";
import { LineInput, LineSave } from "@/components/line-edit";

export default async function InvoicePage({ params }: PageProps<"/invoices/[id]">) {
  const t = await getT();
  const id = Number((await params).id);
  const inv = await db.invoice.findUnique({
    where: { id },
    include: { customer: true, quote: true, lines: { include: { item: true, lot: true, moves: { include: { lot: true } } }, orderBy: { id: "asc" } } },
  });
  if (!inv) notFound();
  const isDraft = inv.status === "DRAFT";
  const taxed = inv.kind === "TAXED";
  const totals = invoiceTotals(inv.lines, inv.vatRate.toString(), inv.whtRate.toString());

  const [items, lots, customers, free, short] = isDraft
    ? await Promise.all([
        db.item.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
        // Batches already expired on the invoice date can't be sold, so they aren't offered.
        db.lot.findMany({ where: { qtyOnHand: { gt: 0 }, OR: [{ expiryDate: null }, { expiryDate: { gte: inv.date } }] }, include: { item: true }, orderBy: [{ expiryDate: "asc" }, { receivedDate: "asc" }] }),
        db.customer.findMany({ orderBy: { name: "asc" } }),
        // What is free to sell, leaving out what this draft itself holds.
        availability(undefined, { invoiceId: inv.id }, inv.date),
        shortages(inv.lines, { invoiceId: inv.id }, inv.date),
      ])
    : [[], [], [], new Map(), []];

  // Cost of what was sold, from the exact lots used.
  const lineCost = (l: (typeof inv.lines)[number]) => l.moves.reduce((s, m) => s.plus(new Decimal(m.qty.toString()).neg().times(m.unitCostEgp.toString())), new Decimal(0));
  const cost = inv.lines.reduce((s, l) => s.plus(lineCost(l)), new Decimal(0));
  const margin = totals.net.minus(cost);
  const bill = inv.status === "POSTED" ? (await customerAccounts({ id: inv.customerId }))[0].bills.find((b) => b.key === `inv:${inv.id}`) : undefined;
  const late = bill && bill.outstanding.gt(0) ? daysLate(bill.dueDate, today()) : 0;
  const credited = bill ? (await db.creditNote.findMany({ where: { invoiceId: inv.id, status: "POSTED" }, include: { lines: true } })).reduce((s, n) => s.plus(creditTotals(n).due), new Decimal(0)) : new Decimal(0);
  const [credit, user] = await Promise.all([isDraft ? creditCheck(inv.customerId, totals.due) : null, currentUser()]);
  const isAdmin = user?.role === "ADMIN";
  const etaMissing = taxed && inv.status === "POSTED" && ["NOT_SENT", "REJECTED", "INVALID"].includes(inv.etaStatus) ? (await prepare(inv.id)).problems : [];

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3"><InvoiceNumber number={inv.number} /> <InvoiceStatusBadge status={inv.status} />{!taxed && <Badge color="gray">{t("Non-taxed")}</Badge>}</span>}
        subtitle={<><RowLink href={`/customers/${inv.customerId}`}>{inv.customer.name}</RowLink> · {t.date(inv.date)}{inv.deliveryNoteNo && <> · {t("Delivery note {no}", { no: inv.deliveryNoteNo })}</>}{inv.quote && <> · {t("From quotation")} <RowLink href={`/quotes/${inv.quote.id}`}>{inv.quote.number}</RowLink></>}</>}
        back={{ href: "/invoices", label: t("Invoices") }}
        actions={!isDraft && <ButtonLink href={`/print/invoices/${inv.id}`} variant="secondary">{t("Print")}</ButtonLink>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card padded={false}>
            <Table
              head={<tr><th>{t("Product")}</th><th className="num">{t("Qty")}</th><th className="num">{t("Price")}</th><th className="num">{t("Amount")}</th>{!isDraft && <th className="num">{t("Margin")}</th>}<th /></tr>}
              empty={t("No products on this invoice yet.")}
              footer={
                inv.lines.length > 0 && (
                  <>
                    <tr className="font-normal"><td colSpan={3}>{t("Subtotal")}</td><td className="num">{money(totals.net)}</td>{!isDraft && <td />}<td /></tr>
                    {taxed && <tr className="font-normal"><td colSpan={3}>{t("VAT {rate}%", { rate: inv.vatRate.toString() })}</td><td className="num">{money(totals.vat)}</td>{!isDraft && <td />}<td /></tr>}
                    <tr><td colSpan={3}>{t("Total (EGP)")}</td><td className="num">{money(totals.total)}</td>{!isDraft && <td />}<td /></tr>
                    {totals.wht.gt(0) && (
                      <>
                        <tr className="font-normal"><td colSpan={3}>{t("Withholding tax {rate}% (deducted by the customer)", { rate: inv.whtRate.toString() })}</td><td className="num">-{money(totals.wht)}</td>{!isDraft && <td />}<td /></tr>
                        <tr><td colSpan={3}>{t("Due from the customer (EGP)")}</td><td className="num">{money(totals.due)}</td>{!isDraft && <td />}<td /></tr>
                      </>
                    )}
                  </>
                )
              }
            >
              {inv.lines.map((l) => {
                const amount = new Decimal(l.qty.toString()).times(l.unitPrice.toString());
                const lm = amount.minus(lineCost(l));
                return (
                  <tr key={l.id}>
                    <td>
                      {l.item.name}
                      <div className="text-xs text-slate-500">
                        {l.moves.length > 0
                          ? l.moves.map((m) => (
                              <span key={m.id} className="me-2">
                                <RowLink href={`/stock/batches/${m.lotId}`}>{batchName(m.lot)}</RowLink> ({qty(new Decimal(m.qty.toString()).neg())})
                              </span>
                            ))
                          : l.lot
                            ? t("Batch {no}", { no: batchName(l.lot) })
                            : t("Earliest expiry first")}
                      </div>
                      {isDraft && l.lot && isExpired(l.lot, inv.date) && <div className="text-xs font-medium text-red-700">{t("This batch expired on {date} and can't be sold. Remove the line and choose another.", { date: t.date(l.lot.expiryDate) })}</div>}
                      {isDraft && l.lot && expiresSoon(l.lot, inv.date) && <div className="text-xs text-amber-700">{t("Expires {date}", { date: t.date(l.lot.expiryDate) })}</div>}
                    </td>
                    {isDraft ? (
                      <>
                        <td className="num whitespace-nowrap"><LineInput form={`line-${l.id}`} name="qty" defaultValue={l.qty.toString()} label={t("Qty")} /> {l.item.unit}</td>
                        <td className="num"><LineInput form={`line-${l.id}`} name="unitPrice" defaultValue={l.unitPrice.toString()} label={t("Price")} /></td>
                      </>
                    ) : (
                      <>
                        <td className="num">{qty(l.qty)} {l.item.unit}</td>
                        <td className="num">{money(l.unitPrice)}</td>
                      </>
                    )}
                    <td className="num">{money(amount)}</td>
                    {!isDraft && <td className={`num ${lm.lt(0) ? "text-red-700" : "text-slate-600"}`}>{amount.isZero() ? "" : pct(lm.div(amount).times(100))}</td>}
                    <td className="text-end">
                      {isDraft && (
                        <div className="flex flex-col items-end gap-1">
                          <LineSave id={`line-${l.id}`} action={updateLine.bind(null, inv.id, l.id)} />
                          <form action={removeLine.bind(null, inv.id, l.id)}>
                            <button className="text-xs text-slate-400 hover:text-red-600">{t("Remove")}</button>
                          </form>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </Table>
            {isDraft && (
              <div className="border-t border-slate-100 p-4">
                <LineForm
                  action={addLine.bind(null, inv.id)}
                  items={items.map((i) => {
                    const a = free.get(i.id) ?? NOTHING;
                    return { id: i.id, code: i.code, name: i.name, unit: i.unit, stock: t("{onHand} {unit} in stock · {reserved} reserved · {free} free", { onHand: qty(a.onHand), reserved: qty(a.reserved), free: qty(a.free), unit: t(i.unit) }) };
                  })}
                  lots={lots.map((l) => ({
                    id: l.id,
                    itemId: l.itemId,
                    label: `${batchName(l)} · ${qty(l.qtyOnHand)} ${l.item.unit}${l.expiryDate ? ` · ${t("exp {date}", { date: t.date(l.expiryDate) })}` : ""}${expiresSoon(l, inv.date) ? ` · ${t("expires soon")}` : ""}`,
                  }))}
                />
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {isDraft ? (
            <>
              <Card title={t("Post invoice")}>
                <ActionForm action={postInvoice.bind(null, inv.id)}>
                  <p className="text-sm text-slate-600">{t("Posting takes the stock out of the batches and fixes the invoice. You can cancel it later if needed.")}</p>
                  {short.length > 0 && (
                    <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
                      <p className="font-medium">{t("Some of this stock is reserved for other customers:")}</p>
                      {short.map((w) => <p key={w}>{t.message(w)}</p>)}
                      {isAdmin ? (
                        <label className="mt-2 flex items-center gap-2 font-medium"><input type="checkbox" name="overReserved" /> {t("Post anyway")}</label>
                      ) : (
                        <p className="mt-1">{t("Only an admin can post it.")}</p>
                      )}
                    </div>
                  )}
                  {credit && credit.warnings.length > 0 && (
                    <div className={`rounded-lg p-3 text-sm ${credit.overLimit ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}>
                      {credit.warnings.map((w) => <p key={w}>{t.message(w)}</p>)}
                      {credit.overLimit && (isAdmin ? (
                        <label className="mt-2 flex items-center gap-2 font-medium"><input type="checkbox" name="overLimit" /> {t("Post anyway")}</label>
                      ) : (
                        <p className="mt-1">{t("Only an admin can post it.")}</p>
                      ))}
                    </div>
                  )}
                  <Submit confirm={isDraftNumber(inv.number) ? t("Post this invoice for EGP {amount}? It gets the next {kind} number.", { amount: money(totals.total), kind: taxed ? t("taxed") : t("non-taxed") }) : t("Post {number} for EGP {amount}?", { number: inv.number, amount: money(totals.total) })}>{t("Post invoice")}</Submit>
                </ActionForm>
              </Card>
              <Card title={t("Details")}>
                <ActionForm action={updateInvoice.bind(null, inv.id)}>
                  <Select label={t("Customer")} name="customerId" defaultValue={inv.customerId} options={customers.map((c) => ({ value: c.id, label: c.name }))} />
                  <Field label={t("Invoice date")} name="date" type="date" defaultValue={toInputDate(inv.date)} required />
                  <Select label={t("Invoice type")} name="kind" defaultValue={inv.kind} options={[{ value: "TAXED", label: t("Taxed (with VAT, sent to ETA)") }, { value: "NON_TAXED", label: t("Non-taxed (NT, no VAT)") }]} />
                  <Field label={t("Invoice number")} name="number" defaultValue={isDraftNumber(inv.number) ? "" : inv.number} dir="ltr" hint={t("Leave empty to number it when it is posted")} />
                  <Field label={t("Delivery note no.")} name="deliveryNoteNo" defaultValue={inv.deliveryNoteNo ?? ""} dir="ltr" />
                  {taxed && (
                    <>
                      <Field label={t("VAT %")} name="vatRate" defaultValue={inv.vatRate.toString()} inputMode="decimal" required />
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="wht" defaultChecked={inv.whtRate.gt(0)} /> {t("Customer deducts 1% withholding tax (WHT, خصم الضريبة)")}</label>
                    </>
                  )}
                  <TextArea label={t("Notes (printed on the invoice)")} name="notes" defaultValue={inv.notes ?? ""} />
                  <Submit variant="secondary">{t("Save")}</Submit>
                </ActionForm>
                <form action={deleteDraft.bind(null, inv.id)} className="mt-4 border-t border-slate-100 pt-4">
                  <button className="text-sm text-red-600 hover:underline">{t("Delete this draft")}</button>
                </form>
              </Card>
            </>
          ) : (
            <>
              {taxed && (inv.status === "POSTED" || inv.etaUuid) && (
                <Card title={t("E-invoice (tax authority)")} actions={<EtaBadge status={inv.etaStatus} />}>
                  <div className="space-y-3 text-sm">
                    {inv.etaUuid && inv.etaLongId && (
                      <p>
                        <a href={shareUrl(inv.etaUuid, inv.etaLongId)} target="_blank" rel="noreferrer" className="font-medium text-brand-700 hover:underline">{t("Open on the ETA portal")}</a>
                        <span className="block text-xs text-slate-500">{t("Sent {when}", { when: inv.etaSentAt?.toLocaleString(t.lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { timeZone: "Africa/Cairo", dateStyle: "medium", timeStyle: "short" }) ?? "" })}</span>
                      </p>
                    )}
                    {inv.etaError && <p className="whitespace-pre-line rounded-lg bg-red-50 p-3 text-red-800">{t.message(inv.etaError)}</p>}
                    {etaMissing.length > 0 && (
                      <div className="rounded-lg bg-amber-50 p-3 text-amber-900">
                        <p className="font-medium">{t("Before sending:")}</p>
                        <ul className="mt-1 list-disc ps-5">{etaMissing.map((m) => <li key={m}>{t.message(m)}</li>)}</ul>
                      </div>
                    )}
                    {inv.status === "POSTED" && etaMissing.length === 0 && ["NOT_SENT", "REJECTED", "INVALID"].includes(inv.etaStatus) && (
                      <EtaSend kind="invoice" id={inv.id} number={inv.number} again={inv.etaStatus !== "NOT_SENT"} mode={signingMode((await etaSettings()).documentVersion)} />
                    )}
                    {inv.etaUuid && ["SUBMITTED", "VALID", "INVALID"].includes(inv.etaStatus) && (
                      <ActionForm action={checkEta.bind(null, inv.id)}>
                        <Submit variant="secondary">{t("Check status")}</Submit>
                      </ActionForm>
                    )}
                  </div>
                </Card>
              )}
              {bill && (
                <Card title={t("Payment")} actions={bill.outstanding.gt(0) && <RowLink href={`/customers/${inv.customerId}`}>{t("Receive")}</RowLink>}>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between"><dt className="text-slate-500">{t("Due")}</dt><dd className={late > 0 ? "font-medium text-amber-700" : ""}>{t.date(bill.dueDate)}{late > 0 && ` · ${t("{n} days late", { n: late })}`}</dd></div>
                    {credited.gt(0) && <div className="flex justify-between"><dt className="text-slate-500">{t("Credited")}</dt><dd className="num">{money(Decimal.min(credited, bill.paid))}</dd></div>}
                    <div className="flex justify-between"><dt className="text-slate-500">{t("Paid")}</dt><dd className="num">{money(Decimal.max(bill.paid.minus(credited), 0))}</dd></div>
                    <div className="flex justify-between border-t border-slate-100 pt-2 font-semibold"><dt>{t("Still owed")}</dt><dd className="num">{bill.outstanding.gt(0) ? money(bill.outstanding) : t("Paid in full")}</dd></div>
                  </dl>
                </Card>
              )}
              {inv.status === "POSTED" && (
                <Card title={t("Profit on this invoice")}>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between"><dt className="text-slate-500">{t("Sales (before VAT)")}</dt><dd className="num">{money(totals.net)}</dd></div>
                    <div className="flex justify-between"><dt className="text-slate-500">{t("Landed cost of goods")}</dt><dd className="num">{money(cost)}</dd></div>
                    <div className="flex justify-between border-t border-slate-100 pt-2 font-semibold">
                      <dt>{t("Gross margin")}</dt>
                      <dd className="num">{money(margin)} · {totals.net.isZero() ? "" : pct(margin.div(totals.net).times(100))}</dd>
                    </div>
                  </dl>
                </Card>
              )}
              <InvoiceCreditNotes invoice={inv} />
              {inv.notes && <Card title={t("Notes")}><p className="whitespace-pre-line text-sm text-slate-700">{inv.notes}</p></Card>}
              {inv.status === "POSTED" && (
                <Card title={t("Cancel invoice")}>
                  <ActionForm action={cancelInvoice.bind(null, inv.id)}>
                    <p className="text-sm text-slate-600">{t("Puts the stock back into the same batches. The invoice number stays used.")}{inv.etaUuid && ["SUBMITTED", "VALID"].includes(inv.etaStatus) && ` ${t("It is also cancelled at the tax authority.")}`}</p>
                    {inv.etaUuid && ["SUBMITTED", "VALID"].includes(inv.etaStatus) && <TextArea label={t("Reason (sent to the tax authority)")} name="reason" required />}
                    <Submit variant="danger" confirm={t("Cancel {number}? This can't be undone.", { number: inv.number })}>{t("Cancel invoice")}</Submit>
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
