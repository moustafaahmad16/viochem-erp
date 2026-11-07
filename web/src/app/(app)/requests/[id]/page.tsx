import { notFound } from "next/navigation";
import { ActionForm, Field, Select, Submit, TextArea } from "@/components/forms";
import { ButtonLink, Card, PageHeader, RowLink, Table } from "@/components/ui";
import { LineInput, LineSave } from "@/components/line-edit";
import { toInputDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { qty } from "@/lib/format";
import { planRequest, type LinePlan } from "@/lib/services/requests";
import { getT } from "@/i18n/server";
import { addLines, cancelRequest, convertRequest, deleteRequest, removeLine, reopenRequest, updateLine, updateRequest } from "../actions";
import { requestItems } from "../items";
import { AddLinesForm } from "../request-rows";
import { LineBadge, RequestStatusBadge } from "../status";

export async function generateMetadata({ params }: PageProps<"/requests/[id]">) {
  const r = await db.customerRequest.findUnique({ where: { id: Number((await params).id) || 0 } });
  return { title: r?.number ?? (await getT())("Customer request") };
}

export default async function RequestPage({ params }: PageProps<"/requests/[id]">) {
  const t = await getT();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const r = await db.customerRequest.findUnique({
    where: { id },
    include: { customer: true, quote: true, lines: { include: { item: true }, orderBy: { id: "asc" } } },
  });
  if (!r) notFound();
  const isOpen = r.status === "OPEN";
  const sent = r.status === "CONVERTED";

  const [plan, items, customers] = await Promise.all([
    isOpen ? planRequest(r.lines) : Promise.resolve([] as LinePlan[]),
    isOpen ? requestItems() : Promise.resolve([]),
    isOpen ? db.customer.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);
  const planOf = new Map(plan.map((p) => [p.lineId, p]));
  const toQuote = plan.filter((p) => p.quote.gt(0)).length;
  const toGap = plan.filter((p) => p.gap.gt(0)).length;

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3">{r.number} <RequestStatusBadge status={r.status} /></span>}
        subtitle={<><RowLink href={`/customers/${r.customerId}`}>{r.customer.name}</RowLink> · {t.date(r.date)}</>}
        back={{ href: "/requests", label: t("Customer requests") }}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card padded={false}>
            <Table
              head={
                <tr>
                  <th>{t("Product")}</th>
                  <th className="num">{t("Asked for")}</th>
                  <th>{sent ? t("Result") : t("Stock")}</th>
                  <th />
                </tr>
              }
              empty={t("No products on this request yet.")}
            >
              {r.lines.map((l) => {
                const unit = t(l.item?.unit ?? l.unit);
                const p = planOf.get(l.id);
                const cas = l.item?.casNumber ?? l.casNumber;
                return (
                  <tr key={l.id}>
                    <td>
                      {l.item ? <RowLink href={`/products/${l.item.id}`}>{l.item.name}</RowLink> : <span className="font-medium">{l.productName}</span>}
                      <div className="text-xs text-slate-500" dir="auto">
                        {[l.item?.code, cas && `CAS ${cas}`].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td className="num whitespace-nowrap">
                      {isOpen ? <><LineInput form={`line-${l.id}`} name="qty" defaultValue={l.qty.toString()} label={t("Qty")} /> {unit}</> : `${qty(l.qty)} ${unit}`}
                    </td>
                    <td>
                      {p && (
                        <div className="space-y-1">
                          <LineBadge kind={p.kind} />
                          {p.kind === "partial" && <div className="text-xs text-slate-600">{t("{quote} {unit} on the quotation · {gap} {unit} missing", { quote: qty(p.quote), gap: qty(p.gap), unit })}</div>}
                        </div>
                      )}
                      {sent && (
                        <div className="space-y-0.5 text-xs">
                          {l.quotedQty && Number(l.quotedQty.toString()) > 0 && <div className="text-emerald-700">{t("{qty} {unit} quoted", { qty: qty(l.quotedQty), unit })}</div>}
                          {l.gapQty && Number(l.gapQty.toString()) > 0 && (
                            <div className="text-amber-800">
                              {t("{qty} {unit} to the supply gap", { qty: qty(l.gapQty), unit })}
                              {l.gapClosedAt && <span className="text-slate-500"> · {t("handled")}</span>}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="text-end">
                      {isOpen && (
                        <div className="flex flex-col items-end gap-1">
                          <LineSave id={`line-${l.id}`} action={updateLine.bind(null, r.id, l.id)} />
                          <form action={removeLine.bind(null, r.id, l.id)}>
                            <button className="text-xs text-slate-400 hover:text-red-600">{t("Remove")}</button>
                          </form>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </Table>
            {isOpen && (
              <div className="border-t border-slate-100">
                <AddLinesForm action={addLines.bind(null, r.id)} items={items} />
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {isOpen && r.lines.length > 0 && (
            <Card title={t("Send on")}>
              <ActionForm action={convertRequest.bind(null, r.id)}>
                <ul className="space-y-1 text-sm text-slate-700">
                  <li>{toQuote ? t("{n} products go onto a new quotation, at what is free in stock.", { n: toQuote }) : t("Nothing is free in stock, so no quotation will be made.")}</li>
                  {toGap > 0 && <li>{t("{n} products go to the supply gap, with the missing quantity and who asked.", { n: toGap })}</li>}
                </ul>
                {toQuote > 0 && <Select label={t("Quotation type")} name="kind" defaultValue="TAXED" options={[{ value: "TAXED", label: t("Taxed (adds 14% VAT)") }, { value: "NON_TAXED", label: t("Non-taxed (no VAT)") }]} />}
                {toQuote > 0 && <p className="text-xs text-slate-500">{t("Prices start at what this customer last paid. Check them on the quotation.")}</p>}
                <Submit confirm={t("Send {number} on?", { number: r.number })}>{toQuote ? t("Make quotation") : t("Send to supply gap")}</Submit>
              </ActionForm>
            </Card>
          )}
          {sent && (
            <Card title={t("Sent on")}>
              <div className="space-y-3 text-sm text-slate-600">
                {r.quote ? (
                  <p>{t("Quotation")} <RowLink href={`/quotes/${r.quote.id}`}>{r.quote.number}</RowLink></p>
                ) : (
                  <p>{t("Nothing was free in stock, so no quotation was made.")}</p>
                )}
                {r.lines.some((l) => l.gapQty && Number(l.gapQty.toString()) > 0) && <ButtonLink href="/supply-gap" variant="secondary">{t("Open the supply gap")}</ButtonLink>}
              </div>
            </Card>
          )}
          {isOpen && (
            <Card title={t("Details")}>
              <ActionForm action={updateRequest.bind(null, r.id)}>
                <Select label={t("Customer")} name="customerId" defaultValue={r.customerId} options={customers.map((c) => ({ value: c.id, label: c.name }))} />
                <Field label={t("Date")} name="date" type="date" defaultValue={toInputDate(r.date)} required />
                <TextArea label={t("Notes")} name="notes" defaultValue={r.notes ?? ""} hint={t("Copied onto the quotation.")} />
                <Submit variant="secondary">{t("Save")}</Submit>
              </ActionForm>
            </Card>
          )}
          {isOpen && (
            <Card title={t("Won't go ahead?")}>
              <div className="space-y-4">
                <ActionForm action={cancelRequest.bind(null, r.id)}>
                  <p className="text-sm text-slate-600">{t("Cancel it to keep it on record without counting it in the supply gap.")}</p>
                  <Submit variant="secondary">{t("Cancel this request")}</Submit>
                </ActionForm>
                <ActionForm action={deleteRequest.bind(null, r.id)} className="border-t border-slate-100 pt-4">
                  <Submit variant="danger" confirm={t("Delete {number}? This can't be undone.", { number: r.number })}>{t("Delete this request")}</Submit>
                </ActionForm>
              </div>
            </Card>
          )}
          {r.status === "CANCELLED" && (
            <Card title={t("Cancelled")}>
              <ActionForm action={reopenRequest.bind(null, r.id)}>
                <Submit variant="secondary">{t("Reopen")}</Submit>
              </ActionForm>
            </Card>
          )}
          {!isOpen && r.notes && <Card title={t("Notes")}><p className="whitespace-pre-line text-sm text-slate-700">{r.notes}</p></Card>}
        </div>
      </div>
    </>
  );
}
