import Decimal from "decimal.js";
import { notFound } from "next/navigation";
import { ActionForm, Field, Select, Submit, TextArea } from "@/components/forms";
import { ButtonLink, Card, PageHeader, RowLink, Table } from "@/components/ui";
import { invoiceTotals } from "@/lib/costing";
import { formatDate, toInputDate, today } from "@/lib/dates";
import { db } from "@/lib/db";
import { money, pct, qty } from "@/lib/format";
import { daysLate } from "@/lib/ledger";
import { customerAccounts } from "@/lib/services/accounts";
import { addLine, cancelInvoice, checkEta, deleteDraft, postInvoice, removeLine, sendToEta, updateInvoice } from "../actions";
import { EtaBadge, InvoiceStatusBadge } from "../status";
import { prepare } from "@/lib/services/einvoice";
import { shareUrl } from "@/lib/eta/client";
import { LineForm } from "./line-form";

export default async function InvoicePage({ params }: PageProps<"/invoices/[id]">) {
  const id = Number((await params).id);
  const inv = await db.invoice.findUnique({
    where: { id },
    include: { customer: true, lines: { include: { item: true, lot: true, moves: { include: { lot: true } } }, orderBy: { id: "asc" } } },
  });
  if (!inv) notFound();
  const isDraft = inv.status === "DRAFT";
  const totals = invoiceTotals(inv.lines, inv.vatRate.toString());

  const [items, lots, customers] = isDraft
    ? await Promise.all([
        db.item.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
        db.lot.findMany({ where: { qtyOnHand: { gt: 0 } }, include: { item: true }, orderBy: [{ expiryDate: "asc" }, { receivedDate: "asc" }] }),
        db.customer.findMany({ orderBy: { name: "asc" } }),
      ])
    : [[], [], []];

  // Cost of what was sold, from the exact lots used.
  const lineCost = (l: (typeof inv.lines)[number]) => l.moves.reduce((s, m) => s.plus(new Decimal(m.qty.toString()).neg().times(m.unitCostEgp.toString())), new Decimal(0));
  const cost = inv.lines.reduce((s, l) => s.plus(lineCost(l)), new Decimal(0));
  const margin = totals.net.minus(cost);
  const bill = inv.status === "POSTED" ? (await customerAccounts({ id: inv.customerId }))[0].bills.find((b) => b.key === `inv:${inv.id}`) : undefined;
  const late = bill && bill.outstanding.gt(0) ? daysLate(bill.dueDate, today()) : 0;
  const etaMissing = inv.status === "POSTED" && ["NOT_SENT", "REJECTED", "INVALID"].includes(inv.etaStatus) ? (await prepare(inv.id)).problems : [];

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3">{inv.number} <InvoiceStatusBadge status={inv.status} /></span>}
        subtitle={<><RowLink href={`/customers/${inv.customerId}`}>{inv.customer.name}</RowLink> · {formatDate(inv.date)}</>}
        back={{ href: "/invoices", label: "Invoices" }}
        actions={!isDraft && <ButtonLink href={`/print/invoices/${inv.id}`} variant="secondary">Print</ButtonLink>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card padded={false}>
            <Table
              head={<tr><th>Product</th><th className="num">Qty</th><th className="num">Price</th><th className="num">Amount</th>{!isDraft && <th className="num">Margin</th>}<th /></tr>}
              empty="No products on this invoice yet."
              footer={
                inv.lines.length > 0 && (
                  <>
                    <tr className="font-normal"><td colSpan={3}>Subtotal</td><td className="num">{money(totals.net)}</td>{!isDraft && <td />}<td /></tr>
                    <tr className="font-normal"><td colSpan={3}>VAT {inv.vatRate.toString()}%</td><td className="num">{money(totals.vat)}</td>{!isDraft && <td />}<td /></tr>
                    <tr><td colSpan={3}>Total (EGP)</td><td className="num">{money(totals.total)}</td>{!isDraft && <td />}<td /></tr>
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
                                <RowLink href={`/stock/lots/${m.lotId}`}>{m.lot.lotNo}</RowLink> ({qty(new Decimal(m.qty.toString()).neg())})
                              </span>
                            ))
                          : l.lot
                            ? `Lot ${l.lot.lotNo}`
                            : "Earliest expiry first"}
                      </div>
                    </td>
                    <td className="num">{qty(l.qty)} {l.item.unit}</td>
                    <td className="num">{money(l.unitPrice)}</td>
                    <td className="num">{money(amount)}</td>
                    {!isDraft && <td className={`num ${lm.lt(0) ? "text-red-700" : "text-slate-600"}`}>{amount.isZero() ? "" : pct(lm.div(amount).times(100))}</td>}
                    <td className="text-end">
                      {isDraft && (
                        <form action={removeLine.bind(null, inv.id, l.id)}>
                          <button className="text-xs text-slate-400 hover:text-red-600">Remove</button>
                        </form>
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
                  items={items.map((i) => ({ id: i.id, label: `${i.name} (${i.code})`, unit: i.unit }))}
                  lots={lots.map((l) => ({
                    id: l.id,
                    itemId: l.itemId,
                    label: `${l.lotNo} · ${qty(l.qtyOnHand)} ${l.item.unit}${l.expiryDate ? ` · exp ${formatDate(l.expiryDate)}` : ""}`,
                  }))}
                />
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {isDraft ? (
            <>
              <Card title="Post invoice">
                <ActionForm action={postInvoice.bind(null, inv.id)}>
                  <p className="text-sm text-slate-600">Posting takes the stock out of the lots and fixes the invoice. You can cancel it later if needed.</p>
                  <Submit confirm={`Post ${inv.number} for EGP ${money(totals.total)}?`}>Post invoice</Submit>
                </ActionForm>
              </Card>
              <Card title="Details">
                <ActionForm action={updateInvoice.bind(null, inv.id)}>
                  <Select label="Customer" name="customerId" defaultValue={inv.customerId} options={customers.map((c) => ({ value: c.id, label: c.name }))} />
                  <Field label="Invoice date" name="date" type="date" defaultValue={toInputDate(inv.date)} required />
                  <Field label="VAT %" name="vatRate" defaultValue={inv.vatRate.toString()} inputMode="decimal" required />
                  <TextArea label="Notes (printed on the invoice)" name="notes" defaultValue={inv.notes ?? ""} />
                  <Submit variant="secondary">Save</Submit>
                </ActionForm>
                <form action={deleteDraft.bind(null, inv.id)} className="mt-4 border-t border-slate-100 pt-4">
                  <button className="text-sm text-red-600 hover:underline">Delete this draft</button>
                </form>
              </Card>
            </>
          ) : (
            <>
              {inv.status !== "DRAFT" && (inv.status === "POSTED" || inv.etaUuid) && (
                <Card title="E-invoice (tax authority)" actions={<EtaBadge status={inv.etaStatus} />}>
                  <div className="space-y-3 text-sm">
                    {inv.etaUuid && inv.etaLongId && (
                      <p>
                        <a href={shareUrl(inv.etaUuid, inv.etaLongId)} target="_blank" rel="noreferrer" className="font-medium text-brand-700 hover:underline">Open on the ETA portal</a>
                        <span className="block text-xs text-slate-500">Sent {inv.etaSentAt?.toLocaleString("en-GB", { timeZone: "Africa/Cairo", dateStyle: "medium", timeStyle: "short" })}</span>
                      </p>
                    )}
                    {inv.etaError && <p className="whitespace-pre-line rounded-lg bg-red-50 p-3 text-red-800">{inv.etaError}</p>}
                    {etaMissing.length > 0 && (
                      <div className="rounded-lg bg-amber-50 p-3 text-amber-900">
                        <p className="font-medium">Before sending:</p>
                        <ul className="mt-1 list-disc ps-5">{etaMissing.map((m) => <li key={m}>{m}</li>)}</ul>
                      </div>
                    )}
                    {inv.status === "POSTED" && etaMissing.length === 0 && ["NOT_SENT", "REJECTED", "INVALID"].includes(inv.etaStatus) && (
                      <ActionForm action={sendToEta.bind(null, inv.id)}>
                        <Submit confirm={`Send ${inv.number} to the tax authority?`}>{inv.etaStatus === "NOT_SENT" ? "Send to ETA" : "Send again"}</Submit>
                      </ActionForm>
                    )}
                    {inv.etaUuid && ["SUBMITTED", "VALID", "INVALID"].includes(inv.etaStatus) && (
                      <ActionForm action={checkEta.bind(null, inv.id)}>
                        <Submit variant="secondary">Check status</Submit>
                      </ActionForm>
                    )}
                  </div>
                </Card>
              )}
              {bill && (
                <Card title="Payment" actions={bill.outstanding.gt(0) && <RowLink href={`/customers/${inv.customerId}`}>Receive</RowLink>}>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between"><dt className="text-slate-500">Due</dt><dd className={late > 0 ? "font-medium text-amber-700" : ""}>{formatDate(bill.dueDate)}{late > 0 && ` · ${late} days late`}</dd></div>
                    <div className="flex justify-between"><dt className="text-slate-500">Paid</dt><dd className="num">{money(bill.paid)}</dd></div>
                    <div className="flex justify-between border-t border-slate-100 pt-2 font-semibold"><dt>Still owed</dt><dd className="num">{bill.outstanding.gt(0) ? money(bill.outstanding) : "Paid in full"}</dd></div>
                  </dl>
                </Card>
              )}
              {inv.status === "POSTED" && (
                <Card title="Profit on this invoice">
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between"><dt className="text-slate-500">Sales (before VAT)</dt><dd className="num">{money(totals.net)}</dd></div>
                    <div className="flex justify-between"><dt className="text-slate-500">Landed cost of goods</dt><dd className="num">{money(cost)}</dd></div>
                    <div className="flex justify-between border-t border-slate-100 pt-2 font-semibold">
                      <dt>Gross margin</dt>
                      <dd className="num">{money(margin)} · {totals.net.isZero() ? "" : pct(margin.div(totals.net).times(100))}</dd>
                    </div>
                  </dl>
                </Card>
              )}
              {inv.notes && <Card title="Notes"><p className="whitespace-pre-line text-sm text-slate-700">{inv.notes}</p></Card>}
              {inv.status === "POSTED" && (
                <Card title="Cancel invoice">
                  <ActionForm action={cancelInvoice.bind(null, inv.id)}>
                    <p className="text-sm text-slate-600">Puts the stock back into the same lots. The invoice number stays used.{inv.etaUuid && ["SUBMITTED", "VALID"].includes(inv.etaStatus) && " It is also cancelled at the tax authority."}</p>
                    {inv.etaUuid && ["SUBMITTED", "VALID"].includes(inv.etaStatus) && <TextArea label="Reason (sent to the tax authority)" name="reason" required />}
                    <Submit variant="danger" confirm={`Cancel ${inv.number}? This can't be undone.`}>Cancel invoice</Submit>
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
