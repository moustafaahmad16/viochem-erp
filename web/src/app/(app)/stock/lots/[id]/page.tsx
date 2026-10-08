import { notFound } from "next/navigation";
import { ActionForm, Field, Submit } from "@/components/forms";
import { Badge, Card, Detail, PageHeader, RowLink, Table } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { money, qty } from "@/lib/format";
import { adjustLot } from "../../actions";

const KIND = { OPENING: "Opening stock", RECEIPT: "Received", SALE: "Sold", ADJUSTMENT: "Stock count" } as const;

export default async function LotPage({ params }: PageProps<"/stock/lots/[id]">) {
  const id = Number((await params).id);
  const lot = await db.lot.findUnique({
    where: { id },
    include: {
      item: true,
      shipmentLine: { include: { shipment: { include: { supplier: true } } } },
      moves: { orderBy: [{ date: "asc" }, { id: "asc" }], include: { invoiceLine: { include: { invoice: { include: { customer: true } } } } } },
    },
  });
  if (!lot) notFound();
  const shipment = lot.shipmentLine?.shipment;

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3">Lot {lot.lotNo} {Number(lot.qtyOnHand) === 0 && <Badge>Used up</Badge>}</span>}
        subtitle={<RowLink href={`/products/${lot.itemId}`}>{lot.item.name}</RowLink>}
        back={{ href: "/stock", label: "Stock on hand" }}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="History" padded={false} className="lg:col-span-2">
          <Table head={<tr><th>Date</th><th>What happened</th><th className="num">Qty</th></tr>}>
            {lot.moves.map((m) => {
              const inv = m.invoiceLine?.invoice;
              return (
                <tr key={m.id}>
                  <td>{formatDate(m.date)}</td>
                  <td>
                    {KIND[m.kind]}
                    {inv && <> on <RowLink href={`/invoices/${inv.id}`}>{inv.number}</RowLink> to {inv.customer.name}</>}
                    {m.kind === "ADJUSTMENT" && m.note && <span className="text-slate-500"> · {m.note}</span>}
                  </td>
                  <td className={`num ${Number(m.qty) < 0 ? "text-red-700" : "text-emerald-700"}`}>{Number(m.qty) > 0 ? "+" : ""}{qty(m.qty)}</td>
                </tr>
              );
            })}
          </Table>
        </Card>
        <div className="space-y-6">
          <Card title="Lot details">
            <dl className="grid grid-cols-2 gap-4">
              <Detail label="On hand">{qty(lot.qtyOnHand)} {lot.item.unit}</Detail>
              <Detail label="Received">{qty(lot.qtyReceived)} {lot.item.unit}</Detail>
              <Detail label="Landed cost / unit">EGP {money(lot.unitCostEgp)}</Detail>
              <Detail label="Value on hand">EGP {money(Number(lot.qtyOnHand) * Number(lot.unitCostEgp))}</Detail>
              <Detail label="Received on">{formatDate(lot.receivedDate)}</Detail>
              <Detail label="Expiry">{formatDate(lot.expiryDate)}</Detail>
              <Detail label="Supplier batch">{lot.supplierBatchNo}</Detail>
              <Detail label="Shipment">{shipment ? <RowLink href={`/shipments/${shipment.id}`}>{shipment.ref}</RowLink> : "Opening stock"}</Detail>
            </dl>
          </Card>
          <Card title="Correct after a stock count">
            <ActionForm action={adjustLot.bind(null, lot.id)}>
              <Field label={`Counted quantity (${lot.item.unit})`} name="counted" defaultValue={lot.qtyOnHand.toString()} inputMode="decimal" required />
              <Field label="Reason" name="note" placeholder="e.g. spillage, sample given" required />
              <Submit variant="secondary">Save count</Submit>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
