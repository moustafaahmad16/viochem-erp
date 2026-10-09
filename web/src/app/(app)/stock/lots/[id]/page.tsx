import { notFound } from "next/navigation";
import { ActionForm, Field, Submit } from "@/components/forms";
import { Badge, Card, Detail, PageHeader, RowLink, Table } from "@/components/ui";
import { db } from "@/lib/db";
import { money, qty } from "@/lib/format";
import { getT } from "@/i18n/server";
import { adjustLot } from "../../actions";

const KIND = { OPENING: "Opening stock", RECEIPT: "Received", SALE: "Sold", ADJUSTMENT: "Stock count", RETURN: "Returned" } as const;

export default async function LotPage({ params }: PageProps<"/stock/lots/[id]">) {
  const t = await getT();
  const id = Number((await params).id);
  const lot = await db.lot.findUnique({
    where: { id },
    include: {
      item: true,
      shipmentLine: { include: { shipment: { include: { supplier: true } } } },
      moves: { orderBy: [{ date: "asc" }, { id: "asc" }], include: { invoiceLine: { include: { invoice: { include: { customer: true } } } }, creditLine: { include: { creditNote: { include: { customer: true } } } } } },
    },
  });
  if (!lot) notFound();
  const shipment = lot.shipmentLine?.shipment;

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3">{t("Lot {no}", { no: lot.lotNo })} {Number(lot.qtyOnHand) === 0 && <Badge>{t("Used up")}</Badge>}</span>}
        subtitle={<RowLink href={`/products/${lot.itemId}`}>{lot.item.name}</RowLink>}
        back={{ href: "/stock", label: t("Stock on hand") }}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title={t("History")} padded={false} className="lg:col-span-2">
          <Table head={<tr><th>{t("Date")}</th><th>{t("What happened")}</th><th className="num">{t("Qty")}</th></tr>}>
            {lot.moves.map((m) => {
              const inv = m.invoiceLine?.invoice;
              return (
                <tr key={m.id}>
                  <td>{t.date(m.date)}</td>
                  <td>
                    {t(KIND[m.kind])}
                    {inv && <> {t("on")} <RowLink href={`/invoices/${inv.id}`}>{inv.number}</RowLink> {t("to")} {inv.customer.name}</>}
                    {m.creditLine && <> {t("on")} <RowLink href={`/credit-notes/${m.creditLine.creditNoteId}`}>{m.creditLine.creditNote.number}</RowLink> {t("from")} {m.creditLine.creditNote.customer.name}</>}
                    {m.kind === "ADJUSTMENT" && m.note && <span className="text-slate-500"> · {m.note}</span>}
                  </td>
                  <td className={`num ${Number(m.qty) < 0 ? "text-red-700" : "text-emerald-700"}`}>{Number(m.qty) > 0 ? "+" : ""}{qty(m.qty)}</td>
                </tr>
              );
            })}
          </Table>
        </Card>
        <div className="space-y-6">
          <Card title={t("Lot details")}>
            <dl className="grid grid-cols-2 gap-4">
              <Detail label={t("On hand")}>{qty(lot.qtyOnHand)} {t(lot.item.unit)}</Detail>
              <Detail label={t("Received")}>{qty(lot.qtyReceived)} {t(lot.item.unit)}</Detail>
              <Detail label={t("Landed cost / unit")}>EGP {money(lot.unitCostEgp)}</Detail>
              <Detail label={t("Value on hand")}>EGP {money(Number(lot.qtyOnHand) * Number(lot.unitCostEgp))}</Detail>
              <Detail label={t("Received on")}>{t.date(lot.receivedDate)}</Detail>
              <Detail label={t("Expiry")}>{t.date(lot.expiryDate)}</Detail>
              <Detail label={t("Supplier batch")}>{lot.supplierBatchNo}</Detail>
              <Detail label={t("Shipment")}>{shipment ? <RowLink href={`/shipments/${shipment.id}`}>{shipment.ref}</RowLink> : t("Opening stock")}</Detail>
            </dl>
          </Card>
          <Card title={t("Correct after a stock count")}>
            <ActionForm action={adjustLot.bind(null, lot.id)}>
              <Field label={t("Counted quantity ({unit})", { unit: t(lot.item.unit) })} name="counted" defaultValue={lot.qtyOnHand.toString()} inputMode="decimal" required />
              <Field label={t("Reason")} name="note" placeholder={t("e.g. spillage, sample given")} required />
              <Submit variant="secondary">{t("Save count")}</Submit>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
