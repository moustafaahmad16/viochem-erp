import { notFound } from "next/navigation";
import { ActionForm, Field, Select, Submit, TextArea } from "@/components/forms";
import { Badge, Card, PageHeader, RowLink, Table } from "@/components/ui";
import { toInputDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { money, pct, qty } from "@/lib/format";
import { analyseRfq, DELAY_PENALTY_PER_DAY, LATE_PENALTY, MONEY_COST_PER_YEAR, type Flag, type Option } from "@/lib/services/rfq";
import { getT } from "@/i18n/server";
import type { T } from "@/i18n/core";
import { CURRENCIES } from "../../suppliers/fields";
import {
  addLine, cancelRfq, chooseQuote, chooseSuggested, deleteQuote, deleteRfq, inviteSupplier, makeOrders, removeLine, removeSupplier, reopenRfq, saveQuote, setRate, unchooseLine, updateLine, updateRfq, uploadReply,
} from "../actions";
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
    case "newSupplier": return { text: t("No shipments from them yet"), color: "gray" as const };
  }
}

export default async function RfqPage({ params }: PageProps<"/rfqs/[id]">) {
  const t = await getT();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  if (!(await db.rfq.count({ where: { id } }))) notFound();
  const a = await analyseRfq(id);
  const { rfq } = a;
  const isOpen = rfq.status === "OPEN";
  const [items, suppliers, orders, quoteCounts] = await Promise.all([
    isOpen ? db.item.findMany({ where: { active: true }, orderBy: { name: "asc" } }) : [],
    db.supplier.findMany({ orderBy: { name: "asc" } }),
    db.purchaseOrder.findMany({ where: { rfqQuotes: { some: { rfqId: id } } }, include: { supplier: true }, orderBy: { id: "asc" } }),
    db.rfqQuote.groupBy({ by: ["supplierId"], where: { rfqId: id }, _count: true }),
  ]);
  const invitedIds = new Set(rfq.suppliers.map((s) => s.supplierId));
  const notInvited = suppliers.filter((s) => !invitedIds.has(s.id));
  const priced = new Map(quoteCounts.map((q) => [q.supplierId, q._count]));
  const anyChosen = a.lines.some((l) => l.chosen);
  const anyBest = a.lines.some((l) => l.best);
  const hasQuotes = a.lines.some((l) => l.options.length);

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3">{rfq.number} <RfqStatusBadge status={rfq.status} /></span>}
        subtitle={
          <>
            {t.date(rfq.date)}
            {rfq.replyBy && ` · ${t("reply by {date}", { date: t.date(rfq.replyBy) })}`}
            {rfq.neededBy && ` · ${t("needed by {date}", { date: t.date(rfq.neededBy) })}`}
          </>
        }
        back={{ href: "/rfqs", label: t("Requests for quotation") }}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={t("1. Products needed")} padded={false}>
            <Table head={<tr><th>{t("Product")}</th><th className="num">{t("Quantity")}</th><th className="num">{t("Last landed cost")}</th><th className="num">{t("Offers")}</th><th /></tr>} empty={t("Add the products you need prices for.")}>
              {rfq.lines.map((l) => {
                const line = a.lines.find((x) => x.lineId === l.id)!;
                return (
                  <tr key={l.id}>
                    <td>
                      <span className="me-2 inline-block font-mono text-xs text-slate-500">{l.item.code}</span>
                      <RowLink href={`/products/${l.itemId}`}>{l.item.name}</RowLink>
                      {l.notes && <div className="text-xs text-slate-500">{l.notes}</div>}
                      {isOpen && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-800">{t("Change")}</summary>
                          <ActionForm action={updateLine.bind(null, id, l.id)} className="mt-2 grid grid-cols-3 gap-2">
                            <Field label={t("Quantity ({unit})", { unit: t(l.item.unit) })} name="qty" inputMode="decimal" defaultValue={l.qty.toString()} required />
                            <Field label={t("Note for suppliers")} name="notes" defaultValue={l.notes ?? ""} />
                            <div className="flex items-end"><Submit variant="secondary">{t("Save")}</Submit></div>
                          </ActionForm>
                        </details>
                      )}
                    </td>
                    <td className="num">{qty(l.qty)} {t(l.item.unit)}</td>
                    <td className="num">{line.lastLanded ? <>EGP {money(line.lastLanded.cost)}<div className="text-xs text-slate-500">{t.date(line.lastLanded.date)}</div></> : ""}</td>
                    <td className="num">{line.options.length}</td>
                    <td className="text-end">
                      {isOpen && (
                        <form action={removeLine.bind(null, id, l.id)}>
                          <button className="text-xs text-slate-400 hover:text-red-600">{t("Remove")}</button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </Table>
            {isOpen && (
              <div className="border-t border-slate-100 p-4">
                <ActionForm action={addLine.bind(null, id)} className="grid gap-3 sm:grid-cols-6" resetOnSuccess>
                  <Select label={t("Product")} name="itemId" options={items.map((i) => ({ value: i.id, label: `${i.name} (${i.code}) · ${t(i.unit)}` }))} placeholder={t("Choose…")} className="sm:col-span-6" required />
                  <Field label={t("Quantity")} name="qty" inputMode="decimal" required className="sm:col-span-2" />
                  <Field label={t("Note for suppliers")} name="notes" placeholder={t("e.g. grade, packing")} className="sm:col-span-2" />
                  <div className="flex items-end sm:col-span-2"><Submit variant="secondary">{t("Add product")}</Submit></div>
                </ActionForm>
              </div>
            )}
          </Card>

          <Card title={t("2. Suppliers")} padded={false}>
            <Table
              head={<tr><th>{t("Supplier")}</th><th>{t("Track record")}</th><th>{t("Sheet")}</th><th>{t("Reply")}</th><th /></tr>}
              empty={t("Add the suppliers you want to ask.")}
            >
              {rfq.suppliers.map((s) => {
                const r = a.records.get(s.supplierId);
                return (
                  <tr key={s.id}>
                    <td><RowLink href={`/suppliers/${s.supplierId}`}>{s.supplier.name}</RowLink><div className="text-xs text-slate-500">{s.supplier.currency}</div></td>
                    <td className="text-xs text-slate-600">
                      {r ? (
                        <>
                          {t("{n} shipments", { n: r.shipments })}
                          {r.onTimePct !== null && <> · {t("{pct} on time", { pct: pct(r.onTimePct) })}</>}
                          {r.landedFactor && <div>{t("Landed costs add {pct}", { pct: pct(r.landedFactor.minus(1).times(100)) })}</div>}
                        </>
                      ) : t("No shipments from them yet")}
                    </td>
                    <td>
                      {rfq.lines.length > 0 && <a href={`/rfqs/${id}/sheet/${s.supplierId}`} className="text-sm font-medium text-brand-700 hover:underline">{t("Download sheet")}</a>}
                      {s.sentAt && <div className="text-xs text-slate-500">{t("Downloaded {date}", { date: t.date(s.sentAt) })}</div>}
                    </td>
                    <td>{s.repliedAt ? <Badge color="green">{t("{n} prices", { n: priced.get(s.supplierId) ?? 0 })}</Badge> : <Badge>{t("Waiting")}</Badge>}</td>
                    <td className="text-end">
                      {isOpen && (
                        <form action={removeSupplier.bind(null, id, s.supplierId)}>
                          <button className="text-xs text-slate-400 hover:text-red-600">{t("Remove")}</button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </Table>
            {isOpen && (
              <div className="grid gap-6 border-t border-slate-100 p-4 md:grid-cols-2">
                <ActionForm action={inviteSupplier.bind(null, id)} resetOnSuccess>
                  <Select label={t("Ask another supplier")} name="supplierId" options={notInvited.map((s) => ({ value: s.id, label: s.name }))} placeholder={t("Choose…")} required />
                  <Submit variant="secondary">{t("Add supplier")}</Submit>
                </ActionForm>
                <ActionForm action={uploadReply.bind(null, id)} resetOnSuccess>
                  <label className="block text-sm font-medium text-slate-700">{t("Load a supplier's reply")}</label>
                  <input
                    type="file"
                    name="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    required
                    aria-label={t("Reply sheet")}
                    className="block w-full text-sm text-slate-600 file:me-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-800 hover:file:bg-slate-200"
                  />
                  <Select label={t("From")} name="supplierId" options={suppliers.map((s) => ({ value: s.id, label: s.name }))} placeholder={t("The supplier the sheet was made for")} />
                  <Submit variant="secondary">{t("Load prices")}</Submit>
                </ActionForm>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {isOpen ? (
            <Card title={t("Details")}>
              <ActionForm action={updateRfq.bind(null, id)}>
                <Field label={t("Date")} name="date" type="date" defaultValue={toInputDate(rfq.date)} required />
                <Field label={t("Suppliers reply by")} name="replyBy" type="date" defaultValue={toInputDate(rfq.replyBy)} />
                <Field label={t("Needed in Egypt by")} name="neededBy" type="date" defaultValue={toInputDate(rfq.neededBy)} hint={t("Offers that would arrive later count as more expensive.")} />
                <TextArea label={t("Notes for suppliers")} name="notes" defaultValue={rfq.notes ?? ""} />
                <Submit variant="secondary">{t("Save")}</Submit>
              </ActionForm>
            </Card>
          ) : (
            rfq.notes && <Card title={t("Notes for suppliers")}><p className="whitespace-pre-line text-sm text-slate-700">{rfq.notes}</p></Card>
          )}

          {a.rates.length > 0 && (
            <Card title={t("Exchange rates")}>
              <p className="mb-3 text-xs text-slate-500">{t("EGP for 1 unit of each currency quoted, used only to compare offers. It starts from the rate on your latest shipment.")}</p>
              <div className="space-y-3">
                {a.rates.map((r) => (
                  <ActionForm key={r.currency} action={setRate.bind(null, id, r.currency)} className="flex items-end gap-2">
                    <Field label={r.currency} name="rate" inputMode="decimal" defaultValue={r.rate?.toString() ?? ""} required hint={r.saved ? undefined : r.rate ? t("From your latest shipment") : t("Needed to compare")} />
                    <Submit variant="secondary">{t("Save")}</Submit>
                  </ActionForm>
                ))}
              </div>
            </Card>
          )}

          {orders.length > 0 && (
            <Card title={t("Purchase orders made")} padded={false}>
              <Table head={<tr><th>{t("Order")}</th><th>{t("Supplier")}</th></tr>}>
                {orders.map((o) => (
                  <tr key={o.id}><td><RowLink href={`/purchase-orders/${o.id}`}>{o.number}</RowLink></td><td>{o.supplier.name}</td></tr>
                ))}
              </Table>
            </Card>
          )}

          <Card title={t("Request status")}>
            <div className="space-y-4 text-sm">
              {isOpen && (
                <ActionForm action={cancelRfq.bind(null, id)}>
                  <p className="text-slate-600">{t("Cancel if you won't buy from this request. The number stays used.")}</p>
                  <Submit variant="danger" confirm={t("Cancel {number}?", { number: rfq.number })}>{t("Cancel request")}</Submit>
                </ActionForm>
              )}
              {rfq.status === "CANCELLED" && (
                <ActionForm action={reopenRfq.bind(null, id)}>
                  <p className="text-slate-600">{t("This request was cancelled.")}</p>
                  <Submit variant="secondary">{t("Reopen request")}</Submit>
                </ActionForm>
              )}
              {rfq.status === "ORDERED" && <p className="text-slate-600">{t("Purchase orders were made from this request. Follow them from Purchase orders.")}</p>}
              {rfq.status !== "ORDERED" && (
                <ActionForm action={deleteRfq.bind(null, id)} className="border-t border-slate-100 pt-4">
                  <Submit variant="danger" confirm={t("Delete {number}? This can't be undone.", { number: rfq.number })}>{t("Delete this request")}</Submit>
                </ActionForm>
              )}
            </div>
          </Card>
        </div>
      </div>

      <h2 className="mb-1 mt-10 text-lg font-semibold text-slate-900">{t("3. Compare and choose")}</h2>
      <p className="mb-4 max-w-4xl text-sm text-slate-500">
        {t("Offers are ranked by comparable cost per unit: the price in EGP, plus freight, duty and charges as that supplier's past shipments added, buying at least their minimum; less what their credit is worth at {rate} a year; plus {late} if it would arrive after the date needed, and {perDay} for each day their shipments usually run late.", {
          rate: pct(MONEY_COST_PER_YEAR * 100),
          late: pct(LATE_PENALTY * 100),
          perDay: pct(DELAY_PENALTY_PER_DAY * 100),
        })}
      </p>

      {!hasQuotes ? (
        <Card><p className="text-sm text-slate-500">{t("No prices yet. Download each supplier's sheet, send it to them, and load their reply here.")}</p></Card>
      ) : (
        <div className="space-y-6">
          {a.missingRates.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{t("Enter the exchange rate for {currencies} to compare those offers.", { currencies: a.missingRates.join(", ") })}</div>
          )}
          <Card title={t("Suggestion")}>
            <div className="grid gap-4 text-sm md:grid-cols-3">
              <div>
                <div className="text-slate-500">{t("Buying each product from its best offer")}</div>
                <div className="num mt-1 text-start text-xl font-semibold">EGP {money(a.suggestedTotal, 0)}</div>
                <div className="text-xs text-slate-500">{t("{n} suppliers, so {n} shipments", { n: a.suggestedSuppliers })}</div>
              </div>
              <div className="md:col-span-2">
                <div className="text-slate-500">{t("Everything from one supplier")}</div>
                {a.singles.length ? (
                  <ul className="mt-1 space-y-1">
                    {a.singles.slice(0, 3).map((s) => (
                      <li key={s.supplierId}>
                        <span className="font-medium">{s.name}</span>: EGP {money(s.total, 0)}{" "}
                        <span className="text-slate-500">{s.extra.gt(0) ? t("({amount} more, but one shipment)", { amount: money(s.extra, 0) }) : t("(same as the suggestion)")}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-1 text-slate-500">{t("No supplier quoted every product.")}</div>
                )}
              </div>
            </div>
            {isOpen && (
              <div className="mt-5 flex flex-wrap gap-3 border-t border-slate-100 pt-4">
                {anyBest && (
                  <ActionForm action={chooseSuggested.bind(null, id)}>
                    <Submit variant="secondary">{t("Use the suggestions")}</Submit>
                  </ActionForm>
                )}
                {anyChosen && (
                  <ActionForm action={makeOrders.bind(null, id)}>
                    <Submit confirm={t("Make purchase orders for the chosen offers? One order per supplier.")}>{t("Make purchase orders (EGP {amount} landed)", { amount: money(a.chosenTotal, 0) })}</Submit>
                  </ActionForm>
                )}
              </div>
            )}
          </Card>

          {a.lines.map((line) => {
            const unit = t(line.unit);
            const next = line.options.filter((o) => o.usable)[1];
            return (
              <Card
                key={line.lineId}
                title={<>{line.name} <span className="font-normal text-slate-500">· {qty(line.qty)} {unit}</span></>}
                actions={line.chosen && isOpen ? (
                  <form action={unchooseLine.bind(null, id, line.lineId)}><button className="text-xs text-slate-500 hover:text-red-600">{t("Clear choice")}</button></form>
                ) : undefined}
                padded={false}
              >
                {line.best && (
                  <p className="border-b border-slate-100 bg-emerald-50/60 px-5 py-3 text-sm text-emerald-900">
                    {next && line.marginOverNext
                      ? t("Suggested: {supplier}. EGP {amount} per {unit} less than {next} once landed costs, credit and timing are counted.", { supplier: line.best.supplierName, amount: money(line.marginOverNext), unit, next: next.supplierName })
                      : t("Suggested: {supplier}, the only offer that can be compared.", { supplier: line.best.supplierName })}
                    {line.best.vsLast && <> {line.best.vsLast.gt(0) ? t("That's {pct} more than last time.", { pct: pct(line.best.vsLast) }) : t("That's {pct} less than last time.", { pct: pct(line.best.vsLast.neg()) })}</>}
                  </p>
                )}
                <Table
                  head={
                    <tr>
                      <th>{t("Supplier")}</th>
                      <th className="num">{t("Price")}</th>
                      <th className="num">{t("Landed / {unit}", { unit })}</th>
                      <th className="num">{t("Lead time")}</th>
                      <th className="num">{t("Credit days")}</th>
                      <th className="num">{t("Comparable / {unit}", { unit })}</th>
                      <th>{t("Notes")}</th>
                      <th />
                    </tr>
                  }
                  empty={t("No offers for this product yet.")}
                >
                  {line.options.map((o) => (
                    <OptionRow key={o.quoteId} o={o} best={line.best?.quoteId === o.quoteId} unit={unit} rfqId={id} isOpen={isOpen} t={t} />
                  ))}
                </Table>
              </Card>
            );
          })}
        </div>
      )}

      {isOpen && rfq.lines.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-medium text-brand-700">{t("Enter a price by hand")}</summary>
          <Card className="mt-3 max-w-3xl">
            <ActionForm action={saveQuote.bind(null, id)} className="grid gap-3 sm:grid-cols-4" resetOnSuccess>
              <Select label={t("Supplier")} name="supplierId" options={suppliers.map((s) => ({ value: s.id, label: s.name }))} placeholder={t("Choose…")} className="sm:col-span-2" required />
              <Select label={t("Product")} name="lineId" options={rfq.lines.map((l) => ({ value: l.id, label: l.item.name }))} placeholder={t("Choose…")} className="sm:col-span-2" required />
              <Field label={t("Price per unit")} name="unitPrice" inputMode="decimal" required />
              <Select label={t("Currency")} name="currency" options={CURRENCIES} defaultValue="USD" required />
              <Field label={t("Minimum order qty")} name="moq" inputMode="decimal" />
              <Field label={t("Lead time (days)")} name="leadTimeDays" inputMode="numeric" />
              <Field label={t("Payment terms (days)")} name="paymentTermsDays" inputMode="numeric" />
              <Field label={t("Price valid until")} name="validUntil" type="date" />
              <Field label={t("Incoterm")} name="incoterm" placeholder="CIF" />
              <Field label={t("Notes")} name="notes" />
              <div className="sm:col-span-4"><Submit variant="secondary">{t("Save price")}</Submit></div>
            </ActionForm>
          </Card>
        </details>
      )}
    </>
  );
}

function OptionRow({ o, best, unit, rfqId, isOpen, t }: { o: Option; best: boolean; unit: string; rfqId: number; isOpen: boolean; t: T }) {
  const chosen = o.awardQty !== null;
  return (
    <tr className={chosen ? "bg-brand-50/60" : !o.usable ? "text-slate-400" : ""}>
      <td>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{o.supplierName}</span>
          {best && <Badge color="green">{t("Suggested")}</Badge>}
          {chosen && <Badge color="blue">{t("Chosen: {qty}", { qty: `${qty(o.awardQty)} ${unit}` })}</Badge>}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {o.flags.map((f, i) => {
            const x = flagText(f, t, unit);
            return <Badge key={i} color={x.color}>{x.text}</Badge>;
          })}
        </div>
      </td>
      <td className="num whitespace-nowrap">
        {o.currency} {money(o.unitPrice)}
        {o.incoterm && <div className="text-xs text-slate-500">{o.incoterm}</div>}
      </td>
      <td className="num whitespace-nowrap">
        {o.landedUnit ? money(o.landedUnit) : "—"}
        {o.vsLast && <div className={`text-xs ${o.vsLast.gt(0) ? "text-red-700" : "text-emerald-700"}`} dir="ltr">{o.vsLast.gt(0) ? "+" : ""}{pct(o.vsLast)}</div>}
      </td>
      <td className="num whitespace-nowrap">{o.leadTimeDays != null ? t("{n} days", { n: o.leadTimeDays }) : "—"}</td>
      <td className="num whitespace-nowrap">{o.paymentTermsDays ? t("{n} days", { n: o.paymentTermsDays }) : "—"}</td>
      <td className="num whitespace-nowrap font-semibold">{o.score ? money(o.score) : "—"}</td>
      <td className="max-w-48 text-xs text-slate-500">
        {o.notes}
        {o.validUntil && <div>{t("Valid until {date}", { date: t.date(o.validUntil) })}</div>}
      </td>
      <td className="text-end whitespace-nowrap">
        {isOpen && (
          <div className="flex items-center justify-end gap-3">
            {!chosen && o.usable && (
              <form action={chooseQuote.bind(null, rfqId, o.quoteId)}>
                <button className="text-sm font-medium text-brand-700 hover:underline">{t("Choose")}</button>
              </form>
            )}
            <form action={deleteQuote.bind(null, rfqId, o.quoteId)}>
              <button className="text-xs text-slate-400 hover:text-red-600">{t("Remove")}</button>
            </form>
          </div>
        )}
        {o.purchaseOrderId && <RowLink href={`/purchase-orders/${o.purchaseOrderId}`}>{t("Order")}</RowLink>}
      </td>
    </tr>
  );
}
