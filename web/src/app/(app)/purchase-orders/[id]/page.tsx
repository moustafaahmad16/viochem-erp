import Decimal from "decimal.js";
import { notFound } from "next/navigation";
import { ActionForm, Field, Select, Submit, TextArea } from "@/components/forms";
import { ButtonLink, Card, PageHeader, RowLink, Table } from "@/components/ui";
import { toInputDate, today } from "@/lib/dates";
import { db } from "@/lib/db";
import { money, pct, qty } from "@/lib/format";
import { orderProgress } from "@/lib/services/orders";
import { getT } from "@/i18n/server";
import { CURRENCIES } from "../../suppliers/fields";
import { StatusBadge } from "../../shipments/status";
import { addLine, cancelOrder, closeOrder, deleteOrder, removeLine, reopenOrder, shipFromOrder, updateLine, updateOrder } from "../actions";
import { OrderStatusBadge } from "../status";

export async function generateMetadata({ params }: PageProps<"/purchase-orders/[id]">) {
  const t = await getT();
  const id = Number((await params).id);
  const order = Number.isInteger(id) ? await db.purchaseOrder.findUnique({ where: { id }, select: { number: true } }) : null;
  return { title: order?.number ?? t("Purchase order") };
}

export default async function PurchaseOrderPage({ params }: PageProps<"/purchase-orders/[id]">) {
  const t = await getT();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const order = await db.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      lines: { include: { item: true, shipmentLines: true }, orderBy: { id: "asc" } },
      shipments: { include: { lines: true }, orderBy: [{ orderDate: "asc" }, { id: "asc" }] },
    },
  });
  if (!order) notFound();
  const isOpen = order.status === "OPEN";
  const progress = orderProgress(order);
  const toShip = order.lines.filter((l) => progress.byLine.get(l.id)!.remaining.gt(0));
  const [items, suppliers] = isOpen
    ? await Promise.all([db.item.findMany({ where: { active: true }, orderBy: { name: "asc" } }), db.supplier.findMany({ orderBy: { name: "asc" } })])
    : [[], []];
  const c = order.currency;

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3">{order.number} <OrderStatusBadge status={order.status} /></span>}
        subtitle={
          <>
            <RowLink href={`/suppliers/${order.supplierId}`}>{order.supplier.name}</RowLink> · {t.date(order.date)}
            {order.expectedDate && ` · ${t("expected {date}", { date: t.date(order.expectedDate) })}`}
          </>
        }
        back={{ href: "/purchase-orders", label: t("Purchase orders") }}
        actions={<ButtonLink href={`/print/purchase-orders/${order.id}`} variant="secondary">{t("Print")}</ButtonLink>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card padded={false}>
            <Table
              head={
                <tr>
                  <th>{t("Product")}</th>
                  <th className="num">{t("Ordered")}</th>
                  <th className="num">{t("Shipped")}</th>
                  <th className="num">{t("Still to come")}</th>
                  <th className="num">{t("Price ({currency})", { currency: c })}</th>
                  <th className="num">{t("Amount")}</th>
                  <th />
                </tr>
              }
              empty={t("No products on this order yet.")}
              footer={
                order.lines.length > 0 && (
                  <tr>
                    <td colSpan={5}>{t("Total ({currency})", { currency: c })} · {t("{pct} shipped", { pct: pct(progress.percentShipped) })}</td>
                    <td className="num">{money(progress.value)}</td>
                    <td />
                  </tr>
                )
              }
            >
              {order.lines.map((l) => {
                const p = progress.byLine.get(l.id)!;
                const unit = t(l.item.unit);
                const locked = !isOpen || l.shipmentLines.length > 0;
                return (
                  <tr key={l.id}>
                    <td>
                      <span className="me-2 inline-block font-mono text-xs text-slate-500">{l.item.code}</span>
                      <RowLink href={`/products/${l.itemId}`}>{l.item.name}</RowLink>
                      {!locked && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-800">{t("Change")}</summary>
                          <ActionForm action={updateLine.bind(null, order.id, l.id)} className="mt-2 grid grid-cols-3 gap-2">
                            <Field label={t("Quantity ({unit})", { unit })} name="qty" inputMode="decimal" defaultValue={l.qty.toString()} required />
                            <Field label={t("Price ({currency})", { currency: c })} name="unitPrice" inputMode="decimal" defaultValue={l.unitPrice.toString()} required />
                            <div className="flex items-end"><Submit variant="secondary">{t("Save")}</Submit></div>
                          </ActionForm>
                        </details>
                      )}
                    </td>
                    <td className="num">{qty(p.ordered)} {unit}</td>
                    <td className="num">{qty(p.shipped)}</td>
                    <td className={`num ${p.remaining.gt(0) ? "font-medium" : "text-slate-400"}`}>{qty(p.remaining)}</td>
                    <td className="num">{money(l.unitPrice, 2)}</td>
                    <td className="num">{money(new Decimal(l.qty.toString()).times(l.unitPrice.toString()))}</td>
                    <td className="text-end">
                      {!locked && (
                        <form action={removeLine.bind(null, order.id, l.id)}>
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
                <ActionForm action={addLine.bind(null, order.id)} className="grid gap-3 sm:grid-cols-6" resetOnSuccess>
                  <Select
                    label={t("Product")}
                    name="itemId"
                    options={items.map((i) => ({ value: i.id, label: `${i.name} (${i.code}) · ${t(i.unit)}` }))}
                    placeholder={t("Choose…")}
                    className="sm:col-span-6"
                    required
                  />
                  <Field label={t("Quantity")} name="qty" inputMode="decimal" required className="sm:col-span-2" />
                  <Field label={t("Price per unit ({currency})", { currency: c })} name="unitPrice" inputMode="decimal" required className="sm:col-span-2" />
                  <div className="flex items-end sm:col-span-2">
                    <Submit variant="secondary">{t("Add to order")}</Submit>
                  </div>
                </ActionForm>
              </div>
            )}
          </Card>

          {isOpen && toShip.length > 0 && (
            <Card title={t("Make a shipment")}>
              <ActionForm action={shipFromOrder.bind(null, order.id, toShip.map((l) => l.id))} className="space-y-4">
                <p className="text-sm text-slate-600">{t("Enter what the supplier is sending now. The rest stays on the order for a later shipment.")}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {toShip.map((l) => {
                    const left = progress.byLine.get(l.id)!.remaining;
                    return (
                      <Field
                        key={l.id}
                        label={`${l.item.name} (${t(l.item.unit)})`}
                        name={`qty_${l.id}`}
                        inputMode="decimal"
                        defaultValue={left.toString()}
                        hint={t("{qty} still to come", { qty: qty(left) })}
                      />
                    );
                  })}
                </div>
                <div className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
                  <Field label={t("Exchange rate to EGP")} name="fxRate" inputMode="decimal" required placeholder={t("e.g. {value}", { value: "48.50" })} hint={t("EGP for 1 {currency}.", { currency: c })} />
                  <Field label={t("Supplier invoice no.")} name="supplierInvoiceNo" />
                  <Field label={t("Order date")} name="orderDate" type="date" defaultValue={toInputDate(today())} required hint={t("The supplier's bill is counted from this date.")} />
                  <div />
                  <Field label={t("Departure date (ETD)")} name="etd" type="date" />
                  <Field label={t("Expected arrival (ETA)")} name="eta" type="date" />
                </div>
                <Submit>{t("Make shipment")}</Submit>
              </ActionForm>
            </Card>
          )}

          <Card title={t("Shipments from this order")} padded={false}>
            <Table head={<tr><th>{t("Shipment")}</th><th>{t("Ordered")}</th><th>{t("ETA")}</th><th className="num">{t("Goods ({currency})", { currency: c })}</th><th>{t("Status")}</th></tr>} empty={t("Nothing shipped yet.")}>
              {order.shipments.map((s) => (
                <tr key={s.id}>
                  <td><RowLink href={`/shipments/${s.id}`}>{s.ref}</RowLink></td>
                  <td>{t.date(s.orderDate)}</td>
                  <td>{t.date(s.eta)}</td>
                  <td className="num">{money(s.lines.reduce((sum, l) => sum.plus(new Decimal(l.qty.toString()).times(l.unitPrice.toString())), new Decimal(0)))}</td>
                  <td><StatusBadge status={s.status} /></td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>

        <div className="space-y-6">
          {isOpen ? (
            <Card title={t("Details")}>
              <ActionForm action={updateOrder.bind(null, order.id)}>
                <Select label={t("Supplier")} name="supplierId" defaultValue={order.supplierId} options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
                <Select label={t("Currency")} name="currency" defaultValue={order.currency} options={CURRENCIES.some((x) => x.value === c) ? CURRENCIES : [...CURRENCIES, { value: c, label: c }]} />
                <Field label={t("Order date")} name="date" type="date" defaultValue={toInputDate(order.date)} required />
                <Field label={t("Expected by")} name="expectedDate" type="date" defaultValue={toInputDate(order.expectedDate)} />
                <TextArea label={t("Notes (printed on the order)")} name="notes" defaultValue={order.notes ?? ""} />
                <Submit variant="secondary">{t("Save")}</Submit>
              </ActionForm>
            </Card>
          ) : (
            order.notes && <Card title={t("Notes")}><p className="whitespace-pre-line text-sm text-slate-700">{order.notes}</p></Card>
          )}

          <Card title={t("Order status")}>
            <div className="space-y-4 text-sm">
              {isOpen && order.lines.length > 0 && (
                <ActionForm action={closeOrder.bind(null, order.id)}>
                  <p className="text-slate-600">{t("Close the order when nothing more is coming, for example if the supplier can't send the rest.")}</p>
                  <Submit variant="secondary" confirm={t("Close {number}? Nothing more will be expected on it.", { number: order.number })}>{t("Close order")}</Submit>
                </ActionForm>
              )}
              {!isOpen && (
                <ActionForm action={reopenOrder.bind(null, order.id)}>
                  <p className="text-slate-600">{order.status === "CLOSED" ? t("Closed orders expect nothing more. Reopen it if more goods are coming.") : t("This order was cancelled.")}</p>
                  <Submit variant="secondary">{t("Reopen order")}</Submit>
                </ActionForm>
              )}
              {order.status !== "CANCELLED" && order.shipments.length === 0 && (
                <ActionForm action={cancelOrder.bind(null, order.id)}>
                  <p className="text-slate-600">{t("Cancel if the order won't go ahead. The number stays used.")}</p>
                  <Submit variant="danger" confirm={t("Cancel {number}?", { number: order.number })}>{t("Cancel order")}</Submit>
                </ActionForm>
              )}
              {isOpen && order.shipments.length === 0 && (
                <ActionForm action={deleteOrder.bind(null, order.id)} className="border-t border-slate-100 pt-4">
                  <Submit variant="danger" confirm={t("Delete {number}? This can't be undone.", { number: order.number })}>{t("Delete this order")}</Submit>
                </ActionForm>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
