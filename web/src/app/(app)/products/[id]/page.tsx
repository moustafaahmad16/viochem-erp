import { notFound } from "next/navigation";
import { ActionForm } from "@/components/forms";
import { Badge, ButtonLink, Card, PageHeader, RowLink, Table } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { money, qty } from "@/lib/format";
import { updateItem } from "../actions";
import { ItemFields } from "../item-form";

export default async function ProductPage({ params }: PageProps<"/products/[id]">) {
  const id = Number((await params).id);
  const item = await db.item.findUnique({
    where: { id },
    include: { lots: { orderBy: { receivedDate: "desc" }, include: { shipmentLine: { include: { shipment: true } } } } },
  });
  if (!item) notFound();
  const onHand = item.lots.reduce((s, l) => s + Number(l.qtyOnHand), 0);

  return (
    <>
      <PageHeader
        title={item.name}
        subtitle={<>{item.code}{item.casNumber && <> · CAS {item.casNumber}</>} · {qty(onHand)} {item.unit} in stock</>}
        back={{ href: "/products", label: "Products" }}
        actions={<ButtonLink href={`/stock/opening?item=${item.id}`} variant="secondary">Add opening stock</ButtonLink>}
      />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card title="Lots" className="lg:col-span-3" padded={false}>
          <Table head={<tr><th>Lot</th><th>Received</th><th>Expiry</th><th className="num">On hand</th><th className="num">Cost / {item.unit}</th></tr>} empty="No stock received yet.">
            {item.lots.map((l) => (
              <tr key={l.id}>
                <td>
                  <RowLink href={`/stock/lots/${l.id}`}>{l.lotNo}</RowLink>
                  <div className="text-xs text-slate-500">{l.shipmentLine ? l.shipmentLine.shipment.ref : "Opening stock"}</div>
                </td>
                <td>{formatDate(l.receivedDate)}</td>
                <td>{formatDate(l.expiryDate)}</td>
                <td className="num">{Number(l.qtyOnHand) > 0 ? qty(l.qtyOnHand) : <Badge>Used up</Badge>}</td>
                <td className="num">{money(l.unitCostEgp)}</td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Details" className="lg:col-span-2">
          <ActionForm action={updateItem.bind(null, item.id)}>
            <ItemFields item={item} />
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
