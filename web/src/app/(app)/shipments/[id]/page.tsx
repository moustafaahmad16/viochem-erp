import Decimal from "decimal.js";
import { notFound } from "next/navigation";
import { ActionForm, Field, Select, Submit, TextArea } from "@/components/forms";
import { Card, Detail, PageHeader, RowLink, Table } from "@/components/ui";
import { landedUnitCosts } from "@/lib/costing";
import { formatDate, toInputDate, today } from "@/lib/dates";
import { db } from "@/lib/db";
import { money, qty } from "@/lib/format";
import { supplierAccounts } from "@/lib/services/accounts";
import { addCharge, addLine, receiveShipment, removeCharge, removeLine, updateShipment } from "../actions";
import { StatusBadge } from "../status";

const CHARGE_KINDS = ["Freight", "Customs duty", "Customs clearance", "Insurance", "Port fees", "Inland transport", "Bank charges", "Other"];

export default async function ShipmentPage({ params }: PageProps<"/shipments/[id]">) {
  const id = Number((await params).id);
  const s = await db.shipment.findUnique({
    where: { id },
    include: { supplier: true, lines: { include: { item: true, lot: true }, orderBy: { id: "asc" } }, charges: { orderBy: { id: "asc" } } },
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
  const goodsForeign = s.lines.reduce((t, l) => t.plus(d(l.qty).times(d(l.unitPrice))), new Decimal(0));
  const goodsEgp = goodsForeign.times(d(s.fxRate));
  const charges = s.charges.reduce((t, c) => t.plus(d(c.amountEgp)), new Decimal(0));
  const [supplierAcc] = await supplierAccounts({ id: s.supplierId });
  const bill = supplierAcc.accounts.find((a) => a.currency === s.currency)?.bills.find((b) => b.key === `shp:${s.id}`);

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3">{s.ref} <StatusBadge status={s.status} /></span>}
        subtitle={<>From <RowLink href={`/suppliers/${s.supplierId}`}>{s.supplier.name}</RowLink> · ordered {formatDate(s.orderDate)}</>}
        back={{ href: "/shipments", label: "Shipments" }}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">Goods ({s.currency})</div><div className="num text-left text-lg font-semibold">{money(goodsForeign)}</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">Goods in EGP at {s.fxRate.toString()}</div><div className="num text-left text-lg font-semibold">{money(goodsEgp)}</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">Charges (EGP)</div><div className="num text-left text-lg font-semibold">{money(charges)}</div></div>
        <div className="rounded-xl border border-brand-100 bg-brand-50 p-4"><div className="text-xs text-brand-700">Total landed cost (EGP)</div><div className="num text-left text-lg font-semibold text-brand-900">{money(goodsEgp.plus(charges))}</div></div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Products" padded={false}>
            <Table
              head={<tr><th>Product</th><th className="num">Qty</th><th className="num">Price ({s.currency})</th><th className="num">Landed / unit (EGP)</th><th>{received ? "Lot" : ""}</th></tr>}
              empty="No products yet. Add the products from the supplier's invoice below."
            >
              {s.lines.map((l) => (
                <tr key={l.id}>
                  <td>
                    <RowLink href={`/products/${l.itemId}`}>{l.item.name}</RowLink>
                    <div className="text-xs text-slate-500">
                      {[l.supplierBatchNo && `Batch ${l.supplierBatchNo}`, l.expiryDate && `Expires ${formatDate(l.expiryDate)}`].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td className="num">{qty(l.qty)} {l.item.unit}</td>
                  <td className="num">{money(l.unitPrice, 2)}</td>
                  <td className="num font-medium">{money(unitCosts.get(l.id))}</td>
                  <td>
                    {l.lot ? (
                      <RowLink href={`/stock/lots/${l.lot.id}`}>{l.lot.lotNo}</RowLink>
                    ) : (
                      <form action={removeLine.bind(null, s.id, l.id)}>
                        <button className="text-xs text-slate-400 hover:text-red-600">Remove</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
            {!received && (
              <div className="border-t border-slate-100 p-4">
                <ActionForm action={addLine.bind(null, s.id)} className="grid gap-3 sm:grid-cols-6" resetOnSuccess>
                  <Select label="Product" name="itemId" options={items.map((i) => ({ value: i.id, label: `${i.name} (${i.code})` }))} className="sm:col-span-3" required placeholder="Choose…" />
                  <Field label="Quantity" name="qty" inputMode="decimal" required />
                  <Field label={`Price (${s.currency})`} name="unitPrice" inputMode="decimal" required className="sm:col-span-2" />
                  <Field label="Supplier batch no." name="supplierBatchNo" className="sm:col-span-2" />
                  <Field label="Expiry date" name="expiryDate" type="date" className="sm:col-span-2" />
                  <div className="flex items-end sm:col-span-2">
                    <Submit variant="secondary">Add product</Submit>
                  </div>
                </ActionForm>
              </div>
            )}
          </Card>

          <Card title="Charges" padded={false}>
            <Table head={<tr><th>Charge</th><th className="num">Amount (EGP)</th><th /></tr>} empty="No charges yet. Add freight, customs duty and clearance as the bills arrive.">
              {s.charges.map((c) => (
                <tr key={c.id}>
                  <td>{c.kind}{c.description && <span className="text-slate-500"> · {c.description}</span>}</td>
                  <td className="num">{money(c.amountEgp)}</td>
                  <td className="text-right">
                    <form action={removeCharge.bind(null, s.id, c.id)}>
                      <button className="text-xs text-slate-400 hover:text-red-600">Remove</button>
                    </form>
                  </td>
                </tr>
              ))}
            </Table>
            <div className="border-t border-slate-100 p-4">
              {received && <p className="mb-3 text-xs text-slate-500">This shipment is received. Changing a charge updates the cost of its lots and of any sales already made from them.</p>}
              <ActionForm action={addCharge.bind(null, s.id)} className="grid gap-3 sm:grid-cols-6" resetOnSuccess>
                <Select label="Charge" name="kind" options={CHARGE_KINDS.map((k) => ({ value: k, label: k }))} className="sm:col-span-2" />
                <Field label="Details" name="description" className="sm:col-span-2" />
                <Field label="Amount (EGP)" name="amountEgp" inputMode="decimal" required />
                <div className="flex items-end">
                  <Submit variant="secondary">Add</Submit>
                </div>
              </ActionForm>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          {!received && (
            <Card title="Receive into stock">
              <ActionForm action={receiveShipment.bind(null, s.id)}>
                <p className="text-sm text-slate-600">When the goods reach the warehouse, receive them. Each product becomes a lot you can sell from.</p>
                <Field label="Arrival date" name="arrivalDate" type="date" defaultValue={toInputDate(today())} required />
                <Submit confirm="Receive this shipment into stock? Products can't be changed after this.">Receive shipment</Submit>
              </ActionForm>
            </Card>
          )}
          {bill && (
            <Card title="Payment to supplier" actions={<RowLink href={`/suppliers/${s.supplierId}`}>Pay</RowLink>}>
              <dl className="grid grid-cols-2 gap-3">
                <Detail label="Due">{formatDate(bill.dueDate)}</Detail>
                <Detail label={`Paid (${s.currency})`}>{money(bill.paid)}</Detail>
                <Detail label={`Still owed (${s.currency})`}>{bill.outstanding.gt(0) ? money(bill.outstanding) : "Paid in full"}</Detail>
              </dl>
            </Card>
          )}
          <Card title="Details">
            {received && (
              <dl className="mb-4 grid grid-cols-2 gap-3">
                <Detail label="Exchange rate">{s.fxRate.toString()} EGP / {s.currency}</Detail>
                <Detail label="Arrived">{formatDate(s.arrivalDate)}</Detail>
                <Detail label="Charges spread by">{s.allocation === "VALUE" ? "Value" : "Quantity"}</Detail>
              </dl>
            )}
            <ActionForm action={updateShipment.bind(null, s.id)}>
              {!received && (
                <>
                  <Select
                    label="Status"
                    name="status"
                    defaultValue={s.status}
                    options={[{ value: "ORDERED", label: "Ordered" }, { value: "IN_TRANSIT", label: "In transit" }, { value: "AT_CUSTOMS", label: "At customs" }]}
                  />
                  <Field label={`Exchange rate (EGP per ${s.currency})`} name="fxRate" defaultValue={s.fxRate.toString()} inputMode="decimal" required />
                  <Select label="Spread charges by" name="allocation" defaultValue={s.allocation} options={[{ value: "VALUE", label: "Value" }, { value: "QUANTITY", label: "Quantity" }]} />
                  <Field label="Order date" name="orderDate" type="date" defaultValue={toInputDate(s.orderDate)} required />
                </>
              )}
              <Field label="Supplier invoice no." name="supplierInvoiceNo" defaultValue={s.supplierInvoiceNo ?? ""} />
              <Field label="Payment due" name="dueDate" type="date" defaultValue={toInputDate(s.dueDate)} hint={`Empty means ${s.supplier.paymentTermsDays} days after the order date, from the supplier's terms.`} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Departure (ETD)" name="etd" type="date" defaultValue={toInputDate(s.etd)} />
                <Field label="Expected (ETA)" name="eta" type="date" defaultValue={toInputDate(s.eta)} />
              </div>
              <TextArea label="Notes" name="notes" defaultValue={s.notes ?? ""} />
              <Submit variant="secondary">Save</Submit>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
