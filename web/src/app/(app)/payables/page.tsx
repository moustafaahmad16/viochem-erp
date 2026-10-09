import { Card, PageHeader, RowLink, Stat, Table } from "@/components/ui";
import { money } from "@/lib/format";
import { supplierAccounts, totalsByCurrency } from "@/lib/services/accounts";
import { AgingCells, agingHead, Balance } from "../payments/parts";

export const metadata = { title: "You owe" };

export default async function PayablesPage() {
  const all = await supplierAccounts();
  const rows = all
    .flatMap((s) => s.accounts.map((a) => ({ supplier: s.supplier, ...a })))
    .filter((r) => !r.balance.isZero())
    .sort((a, b) => a.currency.localeCompare(b.currency) || b.overdue.cmp(a.overdue) || b.balance.cmp(a.balance));
  const totals = totalsByCurrency(rows.filter((r) => r.balance.gt(0)));

  return (
    <>
      <PageHeader title="You owe" subtitle="What is still to be paid to each supplier, in the currency they bill in" />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Stat label="You owe suppliers" value={totals.length ? totals.map((t) => <div key={t.currency}>{t.currency} {money(t.balance, 0)}</div>) : "Nothing"} />
        <Stat
          label="Overdue"
          value={totals.some((t) => t.overdue.gt(0)) ? totals.filter((t) => t.overdue.gt(0)).map((t) => <div key={t.currency}>{t.currency} {money(t.overdue, 0)}</div>) : "None"}
          tone={totals.some((t) => t.overdue.gt(0)) ? "warn" : "default"}
        />
      </div>
      <Card padded={false}>
        <Table head={<tr><th>Supplier</th><th className="num">Balance</th>{agingHead}</tr>} empty="Nothing is owed to suppliers.">
          {rows.map((r) => (
            <tr key={`${r.supplier.id}-${r.currency}`}>
              <td><RowLink href={`/suppliers/${r.supplier.id}`}>{r.supplier.name}</RowLink></td>
              <td className="num font-medium"><Balance value={r.balance} currency={r.currency} /></td>
              <AgingCells aging={r.aging} />
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
