import { Badge, Card, PageHeader, RowLink, Table } from "@/components/ui";
import { formatDate, today } from "@/lib/dates";
import { money, qty } from "@/lib/format";
import { expiringLots } from "@/lib/services/reports";

export const metadata = { title: "Expiring lots" };

const WINDOWS = [30, 90, 180, 365];

export default async function ExpiryPage({ searchParams }: PageProps<"/reports/expiry">) {
  const days = WINDOWS.includes(Number((await searchParams).days)) ? Number((await searchParams).days) : 90;
  const lots = await expiringLots(days);
  const now = today();

  return (
    <>
      <PageHeader title="Expiring lots" subtitle="Stock to sell first, or to re-test" />
      <div className="mb-3 flex gap-1">
        {WINDOWS.map((w) => (
          <a key={w} href={`/reports/expiry?days=${w}`} className={`rounded-full px-3 py-1 text-sm ${days === w ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-200"}`}>
            {w} days
          </a>
        ))}
      </div>
      <Card padded={false}>
        <Table head={<tr><th>Lot</th><th>Product</th><th>Expiry</th><th className="num">Days left</th><th className="num">On hand</th><th className="num">Value (EGP)</th></tr>} empty={`No lots expire in the next ${days} days.`}>
          {lots.map((l) => {
            const left = Math.round((l.expiryDate!.getTime() - now.getTime()) / 86_400_000);
            return (
              <tr key={l.id}>
                <td><RowLink href={`/stock/lots/${l.id}`}>{l.lotNo}</RowLink></td>
                <td>{l.item.name}</td>
                <td>{formatDate(l.expiryDate)}</td>
                <td className="num">{left < 0 ? <Badge color="red">Expired</Badge> : left <= 30 ? <Badge color="amber">{left}</Badge> : left}</td>
                <td className="num">{qty(l.qtyOnHand)} {l.item.unit}</td>
                <td className="num">{money(Number(l.qtyOnHand) * Number(l.unitCostEgp))}</td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}
