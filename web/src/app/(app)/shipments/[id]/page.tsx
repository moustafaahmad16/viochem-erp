import Decimal from "decimal.js";
import { notFound } from "next/navigation";
import { ActionForm, Field, Select, Submit, TextArea } from "@/components/forms";
import { Badge, Card, Detail, PageHeader, RowLink, Table } from "@/components/ui";
import { landedUnitCosts } from "@/lib/costing";
import { toInputDate, today } from "@/lib/dates";
import { db } from "@/lib/db";
import { getT } from "@/i18n/server";
import { money, qty } from "@/lib/format";
import { supplierAccounts } from "@/lib/services/accounts";
import { batchesMissing, CERTIFICATE_TYPE } from "@/lib/services/batches";
import { documentTypes, shipmentDocuments } from "@/lib/services/documents";
import { accountOptions, AccountSelect } from "../../payments/parts";
import { addCharge, addLine, receiveShipment, removeCharge, removeDocument, removeLine, splitLine, updateBatch, updateShipment, uploadDocument } from "../actions";
import { StatusBadge } from "../status";
import { DocumentUpload } from "./documents";

const CHARGE_KINDS = ["Freight", "Customs duty", "Customs clearance", "Insurance", "Port fees", "Inland transport", "Bank charges", "Other"];

export default async function ShipmentPage({ params }: PageProps<"/shipments/[id]">) {
  const t = await getT();
  const id = Number((await params).id);
  const s = await db.shipment.findUnique({
    where: { id },
    include: { supplier: true, purchaseOrder: { select: { id: true, number: true } }, lines: { include: { item: true, lot: true, certificates: { select: { id: true, fileName: true, size: true } } }, orderBy: { id: "asc" } }, charges: { include: { account: true }, orderBy: { id: "asc" } } },
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
  const [[supplierAcc], accounts, allTypes, documents, missing] = await Promise.all([supplierAccounts({ id: s.supplierId }), accountOptions({ egpOnly: true }), documentTypes(), shipmentDocuments(s.id), batchesMissing(s.id)]);
  // Certificates belong to a batch, so they're uploaded with it rather than here.
  const types = allTypes.filter((ty) => ty.name !== CERTIFICATE_TYPE);
  // The standard documents always show, so it's clear which are still missing; other types only once they have a file.
  const checklist = types.filter((ty) => ty.builtIn || documents.some((doc) => doc.typeId === ty.id));
  const missingDocs = checklist.filter((ty) => ty.builtIn && !documents.some((doc) => doc.typeId === ty.id)).length;
  const bill = supplierAcc.accounts.find((a) => a.currency === s.currency)?.bills.find((b) => b.key === `shp:${s.id}`);

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3">{s.ref} <StatusBadge status={s.status} /></span>}
        subtitle={<>{t("From")} <RowLink href={`/suppliers/${s.supplierId}`}>{s.supplier.name}</RowLink> · {t("ordered {date}", { date: t.date(s.orderDate) })}{s.purchaseOrder && <> · {t("From purchase order")} <RowLink href={`/purchase-orders/${s.purchaseOrder.id}`}>{s.purchaseOrder.number}</RowLink></>}</>}
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
          <Card
            title={t("Products and batches")}
            actions={!received && s.lines.length > 0 && <span className={`text-xs ${missing.length ? "text-amber-700" : "text-emerald-700"}`}>{missing.length ? t("{n} batches still need their batch number or certificate", { n: missing.length }) : t("Every batch has its certificate")}</span>}
            padded={false}
          >
            {s.lines.length === 0 && <p className="px-5 py-6 text-center text-sm text-slate-500">{t("No products yet. Add the products from the supplier's invoice below.")}</p>}
            <ul className="divide-y divide-slate-100">
              {s.lines.map((l) => {
                const cert = l.certificates[0];
                return (
                  <li key={l.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                      <div className="font-medium">
                        <RowLink href={`/products/${l.itemId}`}>{l.item.name}</RowLink>
                        {l.supplierBatchNo && <span className="ms-2 text-sm font-normal text-slate-600">{t("Batch {no}", { no: l.supplierBatchNo })}</span>}
                      </div>
                      <div className="flex flex-wrap items-baseline gap-x-5 text-sm">
                        <span className="num">{qty(l.qty)} {t(l.item.unit)}</span>
                        <span className="num text-slate-600">{s.currency} {money(l.unitPrice, 2)}</span>
                        <span className="num font-medium" title={t("Landed / unit (EGP)")}>EGP {money(unitCosts.get(l.id))}</span>
                        {l.lot ? (
                          <RowLink href={`/stock/batches/${l.lot.id}`}>{t("In stock")}</RowLink>
                        ) : (
                          <form action={removeLine.bind(null, s.id, l.id)}>
                            <button className="text-xs text-slate-400 hover:text-red-600">{t("Remove")}</button>
                          </form>
                        )}
                      </div>
                    </div>
                    {received ? (
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        {l.manufactureDate && <span>{t("Made {date}", { date: t.date(l.manufactureDate) })}</span>}
                        {l.expiryDate && <span>{t("Expires {date}", { date: t.date(l.expiryDate) })}</span>}
                        {cert ? (
                          <a href={`/shipments/${s.id}/documents/${cert.id}`} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">{t("Test certificate")}: {cert.fileName}</a>
                        ) : (
                          <Badge color="amber">{t("No certificate")}</Badge>
                        )}
                      </div>
                    ) : null}
                    {(!received || !cert) && (
                      <ActionForm action={updateBatch.bind(null, s.id, l.id)} className="mt-3 grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-12">
                        {!received && (
                          <>
                            <Field label={t("Batch no.")} name="supplierBatchNo" defaultValue={l.supplierBatchNo ?? ""} placeholder={t("From the certificate")} className="sm:col-span-4" />
                            <Field label={t("Manufactured")} name="manufactureDate" type="date" defaultValue={toInputDate(l.manufactureDate)} className="sm:col-span-4" />
                            <Field label={t("Expiry date")} name="expiryDate" type="date" defaultValue={toInputDate(l.expiryDate)} className="sm:col-span-4" />
                          </>
                        )}
                        <div className="sm:col-span-8">
                          <Field label={t("Test certificate")} name="certificate" type="file" accept=".pdf,image/*" hint={cert ? t("Choosing a file replaces the one uploaded.") : t("The supplier's certificate of analysis for this batch. PDF or photo, up to 15 MB.")} />
                          {cert && (
                            <div className="mt-1 flex items-center gap-3 text-xs">
                              <a href={`/shipments/${s.id}/documents/${cert.id}`} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">✓ {cert.fileName}</a>
                              <span className="text-slate-500">{fileSize(cert.size)}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-end sm:col-span-4">
                          <Submit variant="secondary">{t("Save batch")}</Submit>
                        </div>
                      </ActionForm>
                    )}
                    {!received && Number(l.qty) > 0 && (
                      <details className="mt-2 text-sm">
                        <summary className="cursor-pointer text-xs text-brand-700">{t("Part of this came in another batch?")}</summary>
                        <ActionForm action={splitLine.bind(null, s.id, l.id)} className="mt-2 flex flex-wrap items-end gap-3">
                          <Field label={t("Quantity in the other batch ({unit})", { unit: t(l.item.unit) })} name="qty" inputMode="decimal" required placeholder={t("Less than {qty}", { qty: qty(l.qty) })} />
                          <Submit variant="secondary">{t("Split into a new batch")}</Submit>
                        </ActionForm>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
            {!received && (
              <div className="border-t border-slate-100 p-4">
                <p className="mb-3 text-xs text-slate-500">{t("Add one line per batch. If a product came in two batches, add it twice, each with its own batch number and certificate.")}</p>
                <ActionForm action={addLine.bind(null, s.id)} className="grid gap-3 sm:grid-cols-6" resetOnSuccess>
                  <Select label={t("Product")} name="itemId" options={items.map((i) => ({ value: i.id, label: `${i.name} (${i.code})` }))} className="sm:col-span-3" required placeholder={t("Choose…")} />
                  <Field label={t("Quantity")} name="qty" inputMode="decimal" required placeholder={t("e.g. {value}", { value: "500" })} />
                  <Field label={t("Price ({currency})", { currency: s.currency })} name="unitPrice" inputMode="decimal" required placeholder={t("Per unit, as invoiced")} className="sm:col-span-2" />
                  <Field label={t("Batch no.")} name="supplierBatchNo" placeholder={t("From the certificate")} className="sm:col-span-2" />
                  <Field label={t("Manufactured")} name="manufactureDate" type="date" className="sm:col-span-2" />
                  <Field label={t("Expiry date")} name="expiryDate" type="date" className="sm:col-span-2" />
                  <Field label={t("Test certificate")} name="certificate" type="file" accept=".pdf,image/*" className="sm:col-span-4" hint={t("You can also add it later, but it's needed before receiving.")} />
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
              {received && <p className="mb-3 text-xs text-slate-500">{t("This shipment is received. Changing a charge updates the cost of its batches and of any sales already made from them.")}</p>}
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
          <Card title={t("Documents")} actions={<span className="text-xs text-slate-500">{missingDocs ? t("{n} of the standard documents missing", { n: missingDocs }) : t("All standard documents uploaded")}</span>} padded={false}>
            <ul className="divide-y divide-slate-100">
              {checklist.map((ty) => {
                const files = documents.filter((doc) => doc.typeId === ty.id);
                return (
                  <li key={ty.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-5 py-3 text-sm">
                    <div className="flex items-center gap-2 font-medium text-slate-800">
                      <span aria-hidden className={files.length ? "text-emerald-600" : "text-slate-300"}>{files.length ? "✓" : "○"}</span>
                      {ty.builtIn ? t(ty.name) : ty.name}
                    </div>
                    <div className="space-y-1 text-end">
                      {files.length === 0 && <span className="text-xs text-slate-400">{t("Not uploaded yet")}</span>}
                      {files.map((doc) => (
                        <div key={doc.id} className="flex items-center justify-end gap-3">
                          <a href={`/shipments/${s.id}/documents/${doc.id}`} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">{doc.fileName}</a>
                          <span className="text-xs text-slate-500">{fileSize(doc.size)} · {t.date(doc.uploadedAt)}</span>
                          <form action={removeDocument.bind(null, s.id, doc.id)}>
                            <button className="text-xs text-slate-400 hover:text-red-600">{t("Remove")}</button>
                          </form>
                        </div>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-slate-100 p-4">
              <DocumentUpload action={uploadDocument.bind(null, s.id)} types={types} />
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          {!received && (
            <Card title={t("Receive into stock")}>
              <ActionForm action={receiveShipment.bind(null, s.id)}>
                <p className="text-sm text-slate-600">{t("When the goods reach the warehouse, receive them. Each batch goes into stock and can be sold from.")}</p>
                {missing.length > 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{t("Every batch needs its batch number and test certificate first. {n} still missing.", { n: missing.length })}</p>}
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
              <Field label={t("ACID number")} name="acidNumber" defaultValue={s.acidNumber ?? ""} inputMode="numeric" hint={t("The 19-digit number from Nafeza.")} />
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

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
