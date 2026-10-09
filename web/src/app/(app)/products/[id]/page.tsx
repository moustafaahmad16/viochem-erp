import { notFound } from "next/navigation";
import { ActionForm } from "@/components/forms";
import { ExportButtons } from "@/components/export-buttons";
import { Badge, ButtonLink, Card, PageHeader, RowLink, Stat, Table } from "@/components/ui";
import { db } from "@/lib/db";
import { money, pct, qty } from "@/lib/format";
import { productAnalysis, productHistory, type MoveType } from "@/lib/services/product";
import { getT } from "@/i18n/server";
import type { T } from "@/i18n/core";
import { updateItem } from "../actions";
import { ItemFields } from "../item-form";

const TABS = [
  { key: "", label: "Analysis" },
  { key: "movements", label: "Movements" },
  { key: "lots", label: "Lots and details" },
] as const;

const TYPE: Record<MoveType, { label: string; color: "gray" | "green" | "blue" | "amber" | "red" }> = {
  OPENING: { label: "Opening stock", color: "gray" },
  RECEIPT: { label: "Purchase", color: "green" },
  SALE: { label: "Sale", color: "blue" },
  RETURN: { label: "Return", color: "amber" },
  ADJUSTMENT: { label: "Stock count", color: "gray" },
};

export default async function ProductPage({ params, searchParams }: PageProps<"/products/[id]">) {
  const t = await getT();
  const id = Number((await params).id);
  const tab = String((await searchParams).tab ?? "");
  const item = await db.item.findUnique({
    where: { id },
    include: { lots: { orderBy: { receivedDate: "desc" }, include: { shipmentLine: { include: { shipment: true } } } } },
  });
  if (!item) notFound();
  const onHand = item.lots.reduce((s, l) => s + Number(l.qtyOnHand), 0);
  const unit = t(item.unit);
  const pill = (active: boolean) => `rounded-full px-3 py-1 text-sm ${active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-200"}`;

  return (
    <>
      <PageHeader
        title={item.name}
        subtitle={<>{item.code}{item.casNumber && <> · CAS {item.casNumber}</>} · {t("{qty} in stock", { qty: `${qty(onHand)} ${unit}` })}</>}
        back={{ href: "/products", label: t("Products") }}
        actions={
          <>
            {tab === "movements" && <ExportButtons report="product-moves" query={{ id: String(item.id) }} />}
            <ButtonLink href={`/stock/opening?item=${item.id}`} variant="secondary">{t("Add opening stock")}</ButtonLink>
          </>
        }
      />
      <div className="mb-6 flex w-fit gap-1 rounded-lg border border-slate-200 bg-white p-1">
        {TABS.map((x) => (
          <a key={x.key} href={`/products/${item.id}${x.key ? `?tab=${x.key}` : ""}`} className={pill(tab === x.key)}>{t(x.label)}</a>
        ))}
      </div>

      {tab === "movements" ? (
        <Movements itemId={item.id} unit={unit} t={t} />
      ) : tab === "lots" ? (
        <div className="grid gap-6 lg:grid-cols-5">
          <Card title={t("Lots")} className="lg:col-span-3" padded={false}>
            <Table head={<tr><th>{t("Lot")}</th><th>{t("Received")}</th><th>{t("Expiry")}</th><th className="num">{t("On hand")}</th><th className="num">{t("Cost / {unit}", { unit })}</th></tr>} empty={t("No stock received yet.")}>
              {item.lots.map((l) => (
                <tr key={l.id}>
                  <td>
                    <RowLink href={`/stock/lots/${l.id}`}>{l.lotNo}</RowLink>
                    <div className="text-xs text-slate-500">{l.shipmentLine ? l.shipmentLine.shipment.ref : t("Opening stock")}</div>
                  </td>
                  <td>{t.date(l.receivedDate)}</td>
                  <td>{t.date(l.expiryDate)}</td>
                  <td className="num">{Number(l.qtyOnHand) > 0 ? qty(l.qtyOnHand) : <Badge>{t("Used up")}</Badge>}</td>
                  <td className="num">{money(l.unitCostEgp)}</td>
                </tr>
              ))}
            </Table>
          </Card>
          <Card title={t("Details")} className="lg:col-span-2">
            <ActionForm action={updateItem.bind(null, item.id)}>
              <ItemFields item={item} t={t} />
            </ActionForm>
          </Card>
        </div>
      ) : (
        <Analysis itemId={item.id} unit={unit} t={t} />
      )}
    </>
  );
}

async function Analysis({ itemId, unit, t }: { itemId: number; unit: string; t: T }) {
  const [a, history] = await Promise.all([productAnalysis(itemId), productHistory(itemId)]);
  const avgCost = history.at(-1)?.avgCost;
  const month = (d: Date) => t.date(d).slice(3);
  const top = a.months.reduce((m, r) => (r.revenue.gt(m) ? r.revenue : m), a.months[0].revenue);
  const low = a.minQty !== null && a.onHand.lte(a.minQty);
  const margin = (v: { isNeg(): boolean }, text: string) => <span className={v.isNeg() ? "text-red-700" : ""}>{text}</span>;

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">{t("Sales from {from} to {to}, net of returns and price allowances.", { from: t.date(a.from), to: t.date(a.to) })}</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          label={t("On hand")}
          value={`${qty(a.onHand)} ${unit}`}
          hint={<>{t("Worth EGP {amount} at lot cost", { amount: money(a.stockValue) })}{a.onOrder.gt(0) && <> · {t("{qty} ordered or on the way", { qty: `${qty(a.onOrder)} ${unit}` })}</>}</>}
          tone={low ? "warn" : "default"}
        />
        <Stat
          label={t("Average cost / {unit}", { unit })}
          value={avgCost ? `EGP ${money(avgCost)}` : "—"}
          hint={a.lastPurchase ? t("Last bought {date} at EGP {cost}", { date: t.date(a.lastPurchase.date), cost: money(a.lastPurchase.landedCost) }) : t("Weighted average of everything bought")}
        />
        <Stat
          label={t("Stock cover")}
          value={a.coverMonths ? t("{n} months", { n: a.coverMonths.toDecimalPlaces(1).toString() }) : "—"}
          hint={a.monthlyRate.gt(0) ? t("Selling about {qty} a month", { qty: `${qty(a.monthlyRate.toDecimalPlaces(1))} ${unit}` }) : t("Nothing sold in the last 6 months")}
          tone={a.coverMonths && a.coverMonths.lt(2) ? "warn" : "default"}
        />
        <Stat label={t("Sales, last 12 months")} value={`EGP ${money(a.sales.revenue, 0)}`} hint={t("{qty} sold", { qty: `${qty(a.sales.qty)} ${unit}` })} />
        <Stat
          label={t("Gross margin")}
          value={a.sales.revenue.isZero() ? "—" : pct(a.sales.marginPct)}
          hint={t("EGP {amount} over the cost of the lots sold", { amount: money(a.sales.margin, 0) })}
          tone={a.sales.margin.isNeg() ? "warn" : a.sales.revenue.isZero() ? "default" : "good"}
        />
        <Stat
          label={t("Average selling price")}
          value={a.sales.qty.isZero() ? "—" : `EGP ${money(a.sales.avgPrice)}`}
          hint={a.lastSale ? t("Last sold {date}", { date: t.date(a.lastSale) }) : t("Not sold in the last 12 months")}
        />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-5">
        <Card title={t("Sales by month")} className="lg:col-span-3" padded={false}>
          <Table head={<tr><th>{t("Month")}</th><th className="num">{t("Qty")}</th><th className="num">{t("Sales (EGP)")}</th><th className="w-1/4"></th><th className="num">{t("Margin")}</th></tr>}>
            {[...a.months].reverse().map((m) => (
              <tr key={m.month.toISOString()} className={m.qty.isZero() && m.revenue.isZero() ? "text-slate-400" : ""}>
                <td className="whitespace-nowrap">{month(m.month)}</td>
                <td className="num">{m.qty.isZero() ? "" : qty(m.qty)}</td>
                <td className="num">{m.revenue.isZero() ? "" : money(m.revenue, 0)}</td>
                <td>
                  {top.gt(0) && m.revenue.gt(0) && <div className="h-2 rounded-full bg-brand-500" style={{ width: `${m.revenue.div(top).times(100).toFixed(1)}%` }} />}
                </td>
                <td className="num">{m.revenue.isZero() ? "" : margin(m.margin, pct(m.marginPct))}</td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title={t("Top customers")} className="lg:col-span-2" padded={false}>
          <Table head={<tr><th>{t("Customer")}</th><th className="num">{t("Qty")}</th><th className="num">{t("Sales (EGP)")}</th><th className="num">{t("Margin")}</th></tr>} empty={t("Not sold in the last 12 months")}>
            {a.customers.map((c) => (
              <tr key={c.id}>
                <td><RowLink href={`/customers/${c.id}`}>{c.name}</RowLink></td>
                <td className="num">{qty(c.qty)}</td>
                <td className="num">{money(c.revenue, 0)}</td>
                <td className="num">{margin(c.margin, pct(c.marginPct))}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>

      <Card title={t("Buying prices")} padded={false}>
        <Table
          head={<tr><th>{t("Received")}</th><th>{t("Shipment")}</th><th>{t("Supplier")}</th><th className="num">{t("Qty")}</th><th className="num">{t("Price")}</th><th className="num">{t("Landed cost / {unit}", { unit })}</th><th className="num">{t("Price change")}</th></tr>}
          empty={t("No stock received yet.")}
        >
          {a.purchases.map((p) => (
            <tr key={p.lotId}>
              <td className="whitespace-nowrap">{t.date(p.date)}</td>
              <td>{p.shipment ? <RowLink href={`/shipments/${p.shipment.id}`}>{p.shipment.ref}</RowLink> : <RowLink href={`/stock/lots/${p.lotId}`}>{t("Opening stock")}</RowLink>}</td>
              <td>{p.supplier && <RowLink href={`/suppliers/${p.supplier.id}`}>{p.supplier.name}</RowLink>}</td>
              <td className="num">{qty(p.qty)}</td>
              <td className="num whitespace-nowrap">{p.currency} {money(p.unitPrice)}</td>
              <td className="num">EGP {money(p.landedCost)}</td>
              <td className="num">{p.change === null || p.change.isZero() ? "" : <span dir="ltr" className={p.change.gt(0) ? "text-red-700" : "text-emerald-700"}>{p.change.gt(0) ? "+" : ""}{pct(p.change)}</span>}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

async function Movements({ itemId, unit, t }: { itemId: number; unit: string; t: T }) {
  const rows = await productHistory(itemId);
  const last = rows.at(-1);
  return (
    <Card
      title={t("All movements")}
      padded={false}
      actions={<span className="text-xs text-slate-500">{t("The average cost changes only when stock is bought. Margins use the real cost of each lot.")}</span>}
    >
      <Table
        head={
          <tr>
            <th>{t("Date")}</th>
            <th>{t("Type")}</th>
            <th>{t("Document")}</th>
            <th className="num">{t("In")}</th>
            <th className="num">{t("Out")}</th>
            <th className="num">{t("Price (EGP)")}</th>
            <th className="num">{t("Balance ({unit})", { unit })}</th>
            <th className="num">{t("Average cost")}</th>
            <th className="num">{t("Stock value")}</th>
          </tr>
        }
        empty={t("No stock received yet.")}
        footer={last && (
          <tr>
            <td colSpan={6}>{t("Now")}</td>
            <td className="num">{qty(last.balance)}</td>
            <td className="num">{money(last.avgCost)}</td>
            <td className="num">{money(last.value)}</td>
          </tr>
        )}
      >
        {rows.map((r, i) => {
          const changed = i === 0 || !r.avgCost.eq(rows[i - 1].avgCost);
          return (
            <tr key={r.key}>
              <td className="whitespace-nowrap">{t.date(r.date)}</td>
              <td><Badge color={TYPE[r.type].color}>{t(TYPE[r.type].label)}</Badge></td>
              <td>
                {r.doc && <RowLink href={r.doc.href}>{r.doc.label}</RowLink>}
                {r.party && <div><a href={r.party.href} className="text-xs text-slate-500 hover:underline">{r.party.name}</a></div>}
                {r.note && <div className="text-xs text-slate-500">{r.note}</div>}
              </td>
              <td className="num text-emerald-700">{r.qtyIn.isZero() ? "" : qty(r.qtyIn)}</td>
              <td className="num text-red-700">{r.qtyOut.isZero() ? "" : qty(r.qtyOut)}</td>
              <td className="num">{money(r.price)}</td>
              <td className="num font-medium">{qty(r.balance)}</td>
              <td className={`num ${changed ? "font-semibold text-slate-900" : "text-slate-500"}`}>{money(r.avgCost)}</td>
              <td className="num">{money(r.value)}</td>
            </tr>
          );
        })}
      </Table>
    </Card>
  );
}
