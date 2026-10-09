import Decimal from "decimal.js";
import { Card, PageHeader, RowLink, Stat, Table } from "@/components/ui";
import { money } from "@/lib/format";
import { customerAccounts } from "@/lib/services/accounts";
import { getT } from "@/i18n/server";
import { AgingCells, agingHead, Balance } from "../payments/parts";

export async function generateMetadata() {
  return { title: (await getT())("Owed to you") };
}

export default async function ReceivablesPage() {
  const t = await getT();
  const all = await customerAccounts();
  const rows = all.filter((a) => !a.balance.isZero()).sort((a, b) => b.overdue.cmp(a.overdue) || b.balance.cmp(a.balance));
  const sum = (f: (a: (typeof all)[number]) => Decimal) => all.reduce((s, a) => s.plus(f(a)), new Decimal(0));
  const total = sum((a) => Decimal.max(a.balance, 0));
  const overdue = sum((a) => a.overdue);
  const totalsByBucket = all[0]?.aging.map((_, i) => sum((a) => a.aging[i])) ?? [];

  return (
    <>
      <PageHeader title={t("Owed to you")} subtitle={t("What each customer still has to pay, by how late it is")} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label={t("Customers owe you")} value={`EGP ${money(total, 0)}`} />
        <Stat label={t("Overdue")} value={`EGP ${money(overdue, 0)}`} tone={overdue.gt(0) ? "warn" : "default"} hint={total.isZero() ? undefined : t("{pct}% of what is owed", { pct: overdue.div(total).times(100).toFixed(0) })} />
        <Stat label={t("Customers overdue")} value={all.filter((a) => a.overdue.gt(0)).length} />
      </div>
      <Card padded={false}>
        <Table
          head={<tr><th>{t("Customer")}</th><th className="num">{t("Balance (EGP)")}</th>{agingHead}</tr>}
          empty={t("No customer owes anything.")}
          footer={rows.length > 0 && <tr><td>{t("Total")}</td><td className="num">{money(total, 0)}</td><AgingCells aging={totalsByBucket} /></tr>}
        >
          {rows.map((a) => (
            <tr key={a.customer.id}>
              <td><RowLink href={`/customers/${a.customer.id}`}>{a.customer.name}</RowLink></td>
              <td className="num font-medium"><Balance value={a.balance} currency="" /></td>
              <AgingCells aging={a.aging} />
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
