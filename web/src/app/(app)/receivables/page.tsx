import Decimal from "decimal.js";
import { Card, PageHeader, RowLink, Stat, Table } from "@/components/ui";
import { money } from "@/lib/format";
import { customerAccounts } from "@/lib/services/accounts";
import { AgingCells, agingHead, Balance } from "../payments/parts";

export const metadata = { title: "Owed to you" };

export default async function ReceivablesPage() {
  const all = await customerAccounts();
  const rows = all.filter((a) => !a.balance.isZero()).sort((a, b) => b.overdue.cmp(a.overdue) || b.balance.cmp(a.balance));
  const sum = (f: (a: (typeof all)[number]) => Decimal) => all.reduce((s, a) => s.plus(f(a)), new Decimal(0));
  const total = sum((a) => Decimal.max(a.balance, 0));
  const overdue = sum((a) => a.overdue);
  const totalsByBucket = all[0]?.aging.map((_, i) => sum((a) => a.aging[i])) ?? [];

  return (
    <>
      <PageHeader title="Owed to you" subtitle="What each customer still has to pay, by how late it is" />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Customers owe you" value={`EGP ${money(total, 0)}`} />
        <Stat label="Overdue" value={`EGP ${money(overdue, 0)}`} tone={overdue.gt(0) ? "warn" : "default"} hint={total.isZero() ? undefined : `${overdue.div(total).times(100).toFixed(0)}% of what is owed`} />
        <Stat label="Customers overdue" value={all.filter((a) => a.overdue.gt(0)).length} />
      </div>
      <Card padded={false}>
        <Table
          head={<tr><th>Customer</th><th className="num">Balance (EGP)</th>{agingHead}</tr>}
          empty="No customer owes anything."
          footer={rows.length > 0 && <tr><td>Total</td><td className="num">{money(total, 0)}</td><AgingCells aging={totalsByBucket} /></tr>}
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
