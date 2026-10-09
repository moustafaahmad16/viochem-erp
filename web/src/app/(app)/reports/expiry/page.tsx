import { Badge, Card, PageHeader, RowLink, Table } from "@/components/ui";
import { today } from "@/lib/dates";
import { getT } from "@/i18n/server";
import { money, qty } from "@/lib/format";
import { expiringLots } from "@/lib/services/reports";

export async function generateMetadata() {
  return { title: (await getT())("Expiring lots") };
}

const WINDOWS = [30, 90, 180, 365];

export default async function ExpiryPage({ searchParams }: PageProps<"/reports/expiry">) {
  const t = await getT();
  const days = WINDOWS.includes(Number((await searchParams).days)) ? Number((await searchParams).days) : 90;
  const lots = await expiringLots(days);
  const now = today();

  return (
    <>
      <PageHeader title={t("Expiring lots")} subtitle={t("Stock to sell first, or to re-test")} />
      <div className="mb-3 flex gap-1">
        {WINDOWS.map((w) => (
          <a key={w} href={`/reports/expiry?days=${w}`} className={`rounded-full px-3 py-1 text-sm ${days === w ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-200"}`}>
            {t("{n} days", { n: w })}
          </a>
        ))}
      </div>
      <Card padded={false}>
        <Table head={<tr><th>{t("Lot")}</th><th>{t("Product")}</th><th>{t("Expiry")}</th><th className="num">{t("Days left")}</th><th className="num">{t("On hand")}</th><th className="num">{t("Value (EGP)")}</th></tr>} empty={t("No lots expire in the next {n} days.", { n: days })}>
          {lots.map((l) => {
            const left = Math.round((l.expiryDate!.getTime() - now.getTime()) / 86_400_000);
            return (
              <tr key={l.id}>
                <td><RowLink href={`/stock/lots/${l.id}`}>{l.lotNo}</RowLink></td>
                <td>{l.item.name}</td>
                <td>{t.date(l.expiryDate)}</td>
                <td className="num">{left < 0 ? <Badge color="red">{t("Expired")}</Badge> : left <= 30 ? <Badge color="amber">{left}</Badge> : left}</td>
                <td className="num">{qty(l.qtyOnHand)} {t(l.item.unit)}</td>
                <td className="num">{money(Number(l.qtyOnHand) * Number(l.unitCostEgp))}</td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}
