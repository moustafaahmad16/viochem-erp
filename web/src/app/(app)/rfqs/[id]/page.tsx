import { notFound } from "next/navigation";
import { ActionForm, Field, Select, Submit, TextArea } from "@/components/forms";
import { Badge, ButtonLink, Card, PageHeader, RowLink, Table } from "@/components/ui";
import { toInputDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { money, pct, qty } from "@/lib/format";
import { analyseRfq, DELAY_PENALTY_PER_DAY, LATE_PENALTY, MONEY_COST_PER_YEAR, type Flag, type Option } from "@/lib/services/rfq";
import { getT } from "@/i18n/server";
import type { T } from "@/i18n/core";
import { cancelRfq, chooseQuote, deleteRfq, orderSuggested, removeSupplier, reopenRfq, saveLines, setRate, updateRfq, uploadReply } from "../actions";
import { ProductRows } from "../product-rows";
import { RfqStatusBadge } from "../status";

export async function generateMetadata({ params }: PageProps<"/rfqs/[id]">) {
  const t = await getT();
  const id = Number((await params).id);
  const rfq = Number.isInteger(id) ? await db.rfq.findUnique({ where: { id }, select: { number: true } }) : null;
  return { title: rfq?.number ?? t("Request for quotation") };
}

function flagText(f: Flag, t: T, unit: string) {
  switch (f.kind) {
    case "expired": return { text: t("Price expired {date}", { date: t.date(f.date) }), color: "red" as const };
    case "noRate": return { text: t("Enter the {currency} rate", { currency: f.currency }), color: "red" as const };
    case "moq": return { text: t("Minimum {qty}", { qty: `${qty(f.moq)} ${unit}` }), color: "amber" as const };
    case "late": return { text: t("Arrives about {date}, after it's needed", { date: t.date(f.arrives) }), color: "red" as const };
    case "credit": return { text: t("{days} days credit, worth EGP {amount}", { days: f.days, amount: money(f.saving, 0) }), color: "green" as const };
    case "slow": return { text: t("Usually {days} days late", { days: f.days }), color: "amber" as const };
    case "newSupplier": return null;
  }
}

function Flags({ o, t, unit }: { o: Option; t: T; unit: string }) {
  const shown = o.flags.map((f) => flagText(f, t, unit)).filter((x) => x !== null);
  if (!shown.length) return null;
  return <div className="mt-1 flex flex-wrap gap-1">{shown.map((x, i) => <Badge key={i} color={x.color}>{x.text}</Badge>)}</div>;
}

export default async function RfqPage({ params }: PageProps<"/rfqs/[id]">) {
  const t = await getT();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || !(await db.rfq.count({ where: { id } }))) notFound();
  const a = await analyseRfq(id);
  const { rfq } = a;
  const isOpen = rfq.status === "OPEN";
  const [items, suppliers, orders, quoteCounts] = await Promise.all([
    isOpen ? db.item.findMany({ where: { active: true }, orderBy: { name: "asc" } }) : [],
    isOpen ? db.supplier.findMany({ orderBy: { name: "asc" } }) : [],
    db.purchaseOrder.findMany({ where: { rfqQuotes: { some: { rfqId: id } } }, include: { supplier: true }, orderBy: { id: "asc" } }),
    db.rfqQuote.groupBy({ by: ["supplierId"], where: { rfqId: id }, _count: true }),
  ]);
  const priced = new Map(quoteCounts.map((q) => [q.supplierId, q._count]));
  const replies = rfq.suppliers.filter((s) => s.repliedAt);
  const hasQuotes = a.lines.some((l) => l.options.length);
  const toOrder = a.lines.filter((l) => l.chosen ?? l.best);
  const orderTotal = toOrder.reduce((s, l) => s + Number((l.chosen ?? l.best)!.spend ?? 0), 0);

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3">{rfq.number} <RfqStatusBadge status={rfq.status} /></span>}
        subtitle={<>{t.date(rfq.date)}{rfq.neededBy && ` · ${t("needed by {date}", { date: t.date(rfq.neededBy) })}`}</>}
        back={{ href: "/rfqs", label: t("Requests for quotation") }}
        actions={rfq.lines.length > 0 && <ButtonLink href={`/rfqs/${id}/sheet`}>{t("Download sheet for suppliers")}</ButtonLink>}
      />

      {isOpen && !hasQuotes && (
        <ol className="mb-6 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
          <li className="rounded-lg border border-slate-200 bg-white px-4 py-3"><span className="font-semibold text-slate-900">1.</span> {t("Check the products and quantities.")}</li>
          <li className="rounded-lg border border-slate-200 bg-white px-4 py-3"><span className="font-semibold text-slate-900">2.</span> {t("Download the sheet and send it to your suppliers.")}</li>
          <li className="rounded-lg border border-slate-200 bg-white px-4 py-3"><span className="font-semibold text-slate-900">3.</span> {t("Upload each reply here as it comes back.")}</li>
        </ol>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title={t("Products")} className="lg:col-span-2" padded={false}>
          {isOpen ? (
            <ActionForm action={saveLines.bind(null, id)} className="space-y-0">
              <ProductRows
                items={items.map((i) => ({ id: i.id, code: i.code, name: i.name, cas: i.casNumber, unit: i.unit }))}
                initial={rfq.lines.map((l) => ({ itemId: l.itemId, qty: l.qty.toString() }))}
              />
              <div className="border-t border-slate-100 px-4 py-3"><Submit variant="secondary">{t("Save")}</Submit></div>
            </ActionForm>
          ) : (
            <Table head={<tr><th>{t("Product")}</th><th>{t("CAS")}</th><th className="num">{t("Quantity")}</th></tr>}>
              {rfq.lines.map((l) => (
                <tr key={l.id}>
                  <td><RowLink href={`/products/${l.itemId}`}>{l.item.name}</RowLink></td>
                  <td className="font-mono text-xs">{l.item.casNumber}</td>
                  <td className="num">{qty(l.qty)} {t(l.item.unit)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title={t("Supplier replies")}>
          {isOpen && (
            <ActionForm action={uploadReply.bind(null, id)} resetOnSuccess>
              <input
                type="file"
                name="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                required
                aria-label={t("Reply sheet")}
                className="block w-full text-sm text-slate-600 file:me-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-800 hover:file:bg-slate-200"
              />
              <Select label={t("From")} name="supplierId" options={suppliers.map((s) => ({ value: s.id, label: s.name }))} placeholder={t("The name written on the sheet")} />
              <Submit>{t("Upload reply")}</Submit>
            </ActionForm>
          )}
          <ul className="mt-5 divide-y divide-slate-100 border-t border-slate-100 text-sm">
            {replies.length === 0 && <li className="py-3 text-slate-500">{t("No replies yet.")}</li>}
            {replies.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                <span><span className="font-medium">{s.supplier.name}</span> <span className="text-slate-500">· {priced.get(s.supplierId) === 1 ? t("1 price") : t("{n} prices", { n: priced.get(s.supplierId) ?? 0 })}</span></span>
                {isOpen && (
                  <form action={removeSupplier.bind(null, id, s.supplierId)}>
                    <button className="text-xs text-slate-400 hover:text-red-600">{t("Remove")}</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {hasQuotes && (
        <Card title={t("Best offer for each product")} className="mt-6" padded={false}>
          {a.missingRates.length > 0 && (
            <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">{t("Enter the exchange rate for {currencies} below to compare those offers.", { currencies: a.missingRates.join(", ") })}</div>
          )}
          <Table
            head={
              <tr>
                <th>{t("Product")}</th>
                <th>{t("Buy from")}</th>
                <th className="num">{t("Price")}</th>
                <th className="num">{t("Landed cost / unit")}</th>
                <th className="num">{t("Amount (EGP)")}</th>
              </tr>
            }
            footer={toOrder.length > 0 && (
              <tr>
                <td colSpan={4}>{t("Total landed")}</td>
                <td className="num">{money(orderTotal, 0)}</td>
              </tr>
            )}
          >
            {a.lines.map((line) => {
              const pick = line.chosen ?? line.best;
              const unit = t(line.unit);
              const others = line.options.filter((o) => o.quoteId !== pick?.quoteId);
              return (
                <tr key={line.lineId} className="align-top">
                  <td>
                    <div className="font-medium">{line.name}</div>
                    <div className="text-xs text-slate-500">{qty(line.qty)} {unit}</div>
                    {line.options.length > 1 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-brand-700">{t("Compare {n} offers", { n: line.options.length })}</summary>
                        <ul className="mt-2 space-y-2">
                          {[...(pick ? [pick] : []), ...others].map((o) => (
                            <li key={o.quoteId} className={`rounded-lg border px-3 py-2 text-xs ${o.quoteId === pick?.quoteId ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200"} ${o.usable ? "" : "text-slate-400"}`}>
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-medium text-slate-900">{o.supplierName}</span>
                                {isOpen && o.usable && o.quoteId !== pick?.quoteId && (
                                  <form action={chooseQuote.bind(null, id, o.quoteId)}><button className="font-medium text-brand-700 hover:underline">{t("Buy from them instead")}</button></form>
                                )}
                              </div>
                              <div className="mt-0.5">
                                {o.currency} {money(o.unitPrice)} · {t("landed EGP {amount}", { amount: o.landedUnit ? money(o.landedUnit) : "—" })}
                                {o.leadTimeDays != null && ` · ${t("{n} days", { n: o.leadTimeDays })}`}
                              </div>
                              <Flags o={o} t={t} unit={unit} />
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </td>
                  <td>
                    {pick ? (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{pick.supplierName}</span>
                          {line.chosen ? <Badge color="blue">{t("Your choice")}</Badge> : <Badge color="green">{t("Suggested")}</Badge>}
                        </div>
                        {!line.chosen && line.marginOverNext && (
                          <div className="mt-0.5 text-xs text-slate-500">{t("EGP {amount} per {unit} better than the next offer", { amount: money(line.marginOverNext), unit })}</div>
                        )}
                        <Flags o={pick} t={t} unit={unit} />
                      </>
                    ) : (
                      <span className="text-slate-400">{line.options.length ? t("No offer can be compared yet") : t("No offers yet")}</span>
                    )}
                  </td>
                  <td className="num whitespace-nowrap">{pick && `${pick.currency} ${money(pick.unitPrice)}`}</td>
                  <td className="num whitespace-nowrap">
                    {pick?.landedUnit && <>EGP {money(pick.landedUnit)}</>}
                    {pick?.vsLast && <div className={`text-xs ${pick.vsLast.gt(0) ? "text-red-700" : "text-emerald-700"}`}>{pick.vsLast.gt(0) ? t("{pct} more than last time", { pct: pct(pick.vsLast) }) : t("{pct} less than last time", { pct: pct(pick.vsLast.neg()) })}</div>}
                  </td>
                  <td className="num">{pick?.spend && money(pick.spend, 0)}</td>
                </tr>
              );
            })}
          </Table>
          <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 px-5 py-4">
            {isOpen && toOrder.length > 0 && (
              <ActionForm action={orderSuggested.bind(null, id)}>
                <Submit confirm={t("Make purchase orders for these offers? One order per supplier.")}>{t("Make purchase orders")}</Submit>
              </ActionForm>
            )}
            {orders.map((o) => (
              <RowLink key={o.id} href={`/purchase-orders/${o.id}`}>{o.number} · {o.supplier.name}</RowLink>
            ))}
          </div>
          <div className="space-y-3 border-t border-slate-100 px-5 py-4 text-xs text-slate-500">
            {a.rates.length > 0 && (
              <details open={a.missingRates.length > 0}>
                <summary className="cursor-pointer">{t("Exchange rates used")}: {a.rates.map((r) => `${r.currency} ${r.rate ? r.rate.toString() : "?"}`).join(" · ")}</summary>
                <div className="mt-2 flex flex-wrap gap-4">
                  {a.rates.map((r) => (
                    <ActionForm key={r.currency} action={setRate.bind(null, id, r.currency)} className="flex items-end gap-2">
                      <Field label={t("EGP for 1 {currency}", { currency: r.currency })} name="rate" inputMode="decimal" defaultValue={r.rate?.toString() ?? ""} required />
                      <Submit variant="secondary">{t("Save")}</Submit>
                    </ActionForm>
                  ))}
                </div>
              </details>
            )}
            <details>
              <summary className="cursor-pointer">{t("How the suggestion is made")}</summary>
              <p className="mt-2 max-w-3xl">
                {t("Offers are ranked by comparable cost per unit: the price in EGP, plus freight, duty and charges as that supplier's past shipments added, buying at least their minimum; less what their credit is worth at {rate} a year; plus {late} if it would arrive after the date needed, and {perDay} for each day their shipments usually run late.", {
                  rate: pct(MONEY_COST_PER_YEAR * 100),
                  late: pct(LATE_PENALTY * 100),
                  perDay: pct(DELAY_PENALTY_PER_DAY * 100),
                })}
              </p>
            </details>
          </div>
        </Card>
      )}

      <details className="mt-8 text-sm">
        <summary className="cursor-pointer text-slate-600">{t("More options")}</summary>
        <div className="mt-3 grid max-w-4xl gap-6 md:grid-cols-2">
          {isOpen && (
            <Card>
              <ActionForm action={updateRfq.bind(null, id)}>
                <input type="hidden" name="date" value={toInputDate(rfq.date)} />
                <Field label={t("Needed in Egypt by")} name="neededBy" type="date" defaultValue={toInputDate(rfq.neededBy)} hint={t("Offers that would arrive later count as more expensive.")} />
                <TextArea label={t("Notes for suppliers")} name="notes" defaultValue={rfq.notes ?? ""} />
                <Submit variant="secondary">{t("Save")}</Submit>
              </ActionForm>
            </Card>
          )}
          <Card>
            <div className="space-y-4">
              {isOpen && (
                <ActionForm action={cancelRfq.bind(null, id)}>
                  <Submit variant="secondary" confirm={t("Cancel {number}?", { number: rfq.number })}>{t("Cancel request")}</Submit>
                </ActionForm>
              )}
              {rfq.status === "CANCELLED" && (
                <ActionForm action={reopenRfq.bind(null, id)}>
                  <Submit variant="secondary">{t("Reopen request")}</Submit>
                </ActionForm>
              )}
              {rfq.status !== "ORDERED" && (
                <ActionForm action={deleteRfq.bind(null, id)}>
                  <Submit variant="danger" confirm={t("Delete {number}? This can't be undone.", { number: rfq.number })}>{t("Delete this request")}</Submit>
                </ActionForm>
              )}
              {rfq.status === "ORDERED" && <p className="text-slate-600">{t("Purchase orders were made from this request. Follow them from Purchase orders.")}</p>}
            </div>
          </Card>
        </div>
      </details>
    </>
  );
}
