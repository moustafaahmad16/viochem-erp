import Decimal from "decimal.js";
import { ButtonLink, Card, PageHeader, RowLink, Table } from "@/components/ui";
import { addDays, formatDate, today } from "@/lib/dates";
import { money, qty } from "@/lib/format";
import { stockSummary } from "@/lib/services/reports";

export const metadata = { title: "Stock on hand" };

export default async function StockPage() {
  const rows = await stockSummary();
  const total = rows.reduce((t, r) => t.plus(r.value), new Decimal(0));
  const soon = addDays(today(), 90);

  return (
    <>
      <PageHeader
        title="Stock on hand"
        subtitle={<>Valued at landed cost: <span className="font-semibold text-slate-800">EGP {money(total)}</span></>}
        actions={<ButtonLink href="/stock/opening" variant="secondary">Add opening stock</ButtonLink>}
      />
      <Card padded={false}>
        <Table
          head={<tr><th>Product</th><th className="num">On hand</th><th className="num">Lots</th><th>Next expiry</th><th className="num">Avg cost / unit</th><th className="num">Value (EGP)</th></tr>}
          empty="No stock yet. Receive a shipment or add the stock you already have."
          footer={rows.length > 0 && <tr><td colSpan={5}>Total</td><td className="num">{money(total)}</td></tr>}
        >
          {rows.map((r) => (
            <tr key={r.itemId} className="hover:bg-slate-50">
              <td><RowLink href={`/products/${r.itemId}`}>{r.name}</RowLink> <span className="text-xs text-slate-500">{r.code}</span></td>
              <td className="num">{qty(r.qty)} {r.unit}</td>
              <td className="num">{r.lots}</td>
              <td className={r.nextExpiry && r.nextExpiry <= soon ? "font-medium text-amber-700" : ""}>{formatDate(r.nextExpiry)}</td>
              <td className="num">{money(r.value.div(r.qty))}</td>
              <td className="num">{money(r.value)}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
