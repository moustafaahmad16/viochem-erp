import Decimal from "decimal.js";
import { notFound } from "next/navigation";
import { ActionForm, Field, Select, Submit, TextArea } from "@/components/forms";
import { Card, Detail, PageHeader, RowLink, Table } from "@/components/ui";
import { landedUnitCosts } from "@/lib/costing";
import { toInputDate, today } from "@/lib/dates";
import { db } from "@/lib/db";
import { getT } from "@/i18n/server";
import { money, qty } from "@/lib/format";
import { supplierAccounts } from "@/lib/services/accounts";
import { accountOptions, AccountSelect } from "../../payments/parts";
import { addCharge, addLine, receiveShipment, removeCharge, removeLine, updateShipment } from "../actions";
import { StatusBadge } from "../status";

const CHARGE_KINDS = ["Freight", "Customs duty", "Customs clearance", "Insurance", "Port fees", "Inland transport", "Bank charges", "Other"];

export default async function ShipmentPage({ params }: PageProps<"/shipments/[id]">) {
  const t = await getT();
  const id = Number((await params).id);
  const s = await db.shipment.findUnique({
    where: { id },
    include: { supplier: true, lines: { include: { item: true, lot: true }, orderBy: { id: "asc" } }, charges: { include: { account: true }, orderBy: { id: "asc" } } },
  });
  if (!s) notFound();
  const received = s.status === "RECEIVED";
  const items = received ? [] : await db.item.findMany({ where: { active: true }, orderBy: { name: "asc" } });

  const d = (v: { toString(): string }) => new Decimal(v.toString());
  const unitCosts = landedUnitCosts(
    s.lines.map((l) => ({ id: l.id, qty: d(l.qty), unitPrice: d(l.unitPrice) })),
    d(s.fxRate),
    s.charges.map((c) => d(c.amountEgp)),
    s.allocation,
  );
  const goodsForeign = s.lines.reduce((sum, l) => sum.plus(d(l.qty).times(d(l.unitPrice))), new Decimal(0));
  const goodsEgp = goodsForeign.times(d(s.fxRate));
  const charges = s.charges.reduce((sum, c) => sum.plus(d(c.amountEgp)), new Decimal(0));
  const [[supplierAcc], accounts] = await Promise.all([supplierAccounts({ id: s.supplierId }), accountOptions({ egpOnly: true })]);
  const bill = supplierAcc.accounts.find((a) => a.currency === s.currency)?.bills.find((b) => b.key === `shp:${s.id}`);

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3">{s.ref} <StatusBadge status={s.status} /></span>}
        subtitle={<>{t("From")} <RowLink href={`/suppliers/${s.supplierId}`}>{s.supplier.name}</RowLink> · {t("ordered {date}", { date: t.date(s.orderDate) })}</>}
        back={{ href: "/shipments", label: t("Shipments") }}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">{t("Goods ({currency})", { currency: s.currency })}</div><div className="num text-start text-lg font-semibold">{money(goodsForeign)}</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">{t("Goods in EGP at {rate}", { rate: s.fxRate.toString() })}</div><div className="num text-start text-lg font-semibold">{money(goodsEgp)}</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">{t("Charges (EGP)")}</div><div className="num text-start text-lg font-semibold">{money(charges)}</div></div>
        <div className="rounded-xl border border-brand-100 bg-brand-50 p-4"><div className="text-xs text-brand-700">{t("Total landed cost (EGP)")}</div><div className="num text-start text-lg font-semibold text-brand-900">{money(goodsEgp.plus(charges))}</div></div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={t("Products")} padded={false}>
            <Table
              head={<tr><th>{t("Product")}</th><th className="num">{t("Qty")}</th><th className="num">{t("Price ({currency})", { currency: s.currency })}</th><th className="num">{t("Landed / unit (EGP)")}</th><th>{received ? t("Lot") : ""}</th></tr>}
              empty={t("No products yet. Add the products from the supplier's invoice below.")}
            >
              {s.lines.map((l) => (
                <tr key={l.id}>
                  <td>
                    <RowLink href={`/products/${l.itemId}`}>{l.item.name}</RowLink>
                    <div className="text-xs text-slate-500">
                      {[l.supplierBatchNo && t("Batch {no}", { no: l.supplierBatchNo }), l.expiryDate && t("Expires {date}", { date: t.date(l.expiryDate) })].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td className="num">{qty(l.qty)} {t(l.item.unit)}</td>
                  <td className="num">{money(l.unitPrice, 2)}</td>
                  <td className="num font-medium">{money(unitCosts.get(l.id))}</td>
                  <td>
                    {l.lot ? (
                      <RowLink href={`/stock/lots/${l.lot.id}`}>{l.lot.lotNo}</RowLink>
                    ) : (
                      <form action={removeLine.bind(null, s.id, l.id)}>
                        <button className="text-xs text-slate-400 hover:text-red-600">{t("Remove")}</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
            {!received && (
              <div className="border-t border-slate-100 p-4">
                <ActionForm action={addLine.bind(null, s.id)} className="grid gap-3 sm:grid-cols-6" resetOnSuccess>
                  <Select label={t("Product")} name="itemId" options={items.map((i) => ({ value: i.id, label: `${i.name} (${i.code})` }))} className="sm:col-span-3" required placeholder={t("Choose…")} />
                  <Field label={t("Quantity")} name="qty" inputMode="decimal" required />
                  <Field label={t("Price ({currency})", { currency: s.currency })} name="unitPrice" inputMode="decimal" required className="sm:col-span-2" />
                  <Field label={t("Supplier batch no.")} name="supplierBatchNo" className="sm:col-span-2" />
                  <Field label={t("Expiry date")} name="expiryDate" type="date" className="sm:col-span-2" />
                  <div className="flex items-end sm:col-span-2">
                    <Submit variant="secondary">{t("Add product")}</Submit>
                  </div>
                </ActionForm>
              </div>
            )}
          </Card>

          <Card title={t("Charges")} padded={false}>
            <Table head={<tr><th>{t("Charge")}</th><th className="num">{t("Amount (EGP)")}</th><th /></tr>} empty={t("No charges yet. Add freight, customs duty and clearance as the bills arrive.")}>
              {s.charges.map((c) => (
                <tr key={c.id}>
                  <td>
                    {t(c.kind)}{c.description && <span className="text-slate-500"> · {c.description}</span>}
                    {(c.date || c.account) && <div className="text-xs text-slate-500">{t("Paid {details}", { details: [t.date(c.date), c.account && t("from {account}", { account: c.account.name })].filter(Boolean).join(" ") })}</div>}
                  </td>
                  <td className="num">{money(c.amountEgp)}</td>
                  <td className="text-end">
                    <form action={removeCharge.bind(null, s.id, c.id)}>
                      <button className="text-xs text-slate-400 hover:text-red-600">{t("Remove")}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </Table>
            <div className="border-t border-slate-100 p-4">
              {received && <p className="mb-3 text-xs text-slate-500">{t("This shipment is received. Changing a charge updates the cost of its lots and of any sales already made from them.")}</p>}
              <ActionForm action={addCharge.bind(null, s.id)} className="grid gap-3 sm:grid-cols-6" resetOnSuccess>
                <Select label={t("Charge")} name="kind" options={CHARGE_KINDS.map((k) => ({ value: k, label: t(k) }))} className="sm:col-span-2" />
                <Field label={t("Details")} name="description" className="sm:col-span-2" />
                <Field label={t("Amount (EGP)")} name="amountEgp" inputMode="decimal" required className="sm:col-span-2" />
                <Field label={t("Paid on")} name="date" type="date" defaultValue={toInputDate(today())} className="sm:col-span-2" />
                <div className="sm:col-span-2"><AccountSelect label={t("Paid from")} accounts={accounts} /></div>
                <div className="flex items-end sm:col-span-2">
                  <Submit variant="secondary">{t("Add")}</Submit>
                </div>
              </ActionForm>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          {!received && (
            <Card title={t("Receive into stock")}>
              <ActionForm action={receiveShipment.bind(null, s.id)}>
                <p className="text-sm text-slate-600">{t("When the goods reach the warehouse, receive them. Each product becomes a lot you can sell from.")}</p>
                <Field label={t("Arrival date")} name="arrivalDate" type="date" defaultValue={toInputDate(today())} required />
                <Submit confirm="Receive this shipment into stock? Products can't be changed after this.">{t("Receive shipment")}</Submit>
              </ActionForm>
            </Card>
          )}
          {bill && (
            <Card title={t("Payment to supplier")} actions={<RowLink href={`/suppliers/${s.supplierId}`}>{t("Pay")}</RowLink>}>
              <dl className="grid grid-cols-2 gap-3">
                <Detail label={t("Due")}>{t.date(bill.dueDate)}</Detail>
                <Detail label={t("Paid ({currency})", { currency: s.currency })}>{money(bill.paid)}</Detail>
                <Detail label={t("Still owed ({currency})", { currency: s.currency })}>{bill.outstanding.gt(0) ? money(bill.outstanding) : t("Paid in full")}</Detail>
              </dl>
            </Card>
          )}
          <Card title={t("Details")}>
            {received && (
              <dl className="mb-4 grid grid-cols-2 gap-3">
                <Detail label={t("Exchange rate")}>{s.fxRate.toString()} EGP / {s.currency}</Detail>
                <Detail label={t("Arrived")}>{t.date(s.arrivalDate)}</Detail>
                <Detail label={t("Charges spread by")}>{s.allocation === "VALUE" ? t("Value") : t("Quantity")}</Detail>
              </dl>
            )}
            <ActionForm action={updateShipment.bind(null, s.id)}>
              {!received && (
                <>
                  <Select
                    label={t("Status")}
                    name="status"
                    defaultValue={s.status}
                    options={[{ value: "ORDERED", label: t("Ordered") }, { value: "IN_TRANSIT", label: t("In transit") }, { value: "AT_CUSTOMS", label: t("At customs") }]}
                  />
                  <Field label={t("Exchange rate (EGP per {currency})", { currency: s.currency })} name="fxRate" defaultValue={s.fxRate.toString()} inputMode="decimal" required />
                  <Select label={t("Spread charges by")} name="allocation" defaultValue={s.allocation} options={[{ value: "VALUE", label: t("Value") }, { value: "QUANTITY", label: t("Quantity") }]} />
                  <Field label={t("Order date")} name="orderDate" type="date" defaultValue={toInputDate(s.orderDate)} required />
                </>
              )}
              <Field label={t("Supplier invoice no.")} name="supplierInvoiceNo" defaultValue={s.supplierInvoiceNo ?? ""} />
              <Field label={t("Payment due")} name="dueDate" type="date" defaultValue={toInputDate(s.dueDate)} hint={t("Empty means {n} days after the order date, from the supplier's terms.", { n: s.supplier.paymentTermsDays })} />
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("Departure (ETD)")} name="etd" type="date" defaultValue={toInputDate(s.etd)} />
                <Field label={t("Expected (ETA)")} name="eta" type="date" defaultValue={toInputDate(s.eta)} />
              </div>
              <TextArea label={t("Notes")} name="notes" defaultValue={s.notes ?? ""} />
              <Submit variant="secondary">{t("Save")}</Submit>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
