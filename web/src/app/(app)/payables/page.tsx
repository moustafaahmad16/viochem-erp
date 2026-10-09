import { Card, PageHeader, RowLink, Stat, Table } from "@/components/ui";
import { money } from "@/lib/format";
import { getT } from "@/i18n/server";
import { supplierAccounts, totalsByCurrency } from "@/lib/services/accounts";
import { AgingCells, agingHead, Balance } from "../payments/parts";

export async function generateMetadata() {
  return { title: (await getT())("You owe") };
}

export default async function PayablesPage() {
  const t = await getT();
  const all = await supplierAccounts();
  const rows = all
    .flatMap((s) => s.accounts.map((a) => ({ supplier: s.supplier, ...a })))
    .filter((r) => !r.balance.isZero())
    .sort((a, b) => a.currency.localeCompare(b.currency) || b.overdue.cmp(a.overdue) || b.balance.cmp(a.balance));
  const totals = totalsByCurrency(rows.filter((r) => r.balance.gt(0)));

  return (
    <>
      <PageHeader title={t("You owe")} subtitle={t("What is still to be paid to each supplier, in the currency they bill in")} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Stat label={t("You owe suppliers")} value={totals.length ? totals.map((x) => <div key={x.currency}>{x.currency} {money(x.balance, 0)}</div>) : t("Nothing")} />
        <Stat
          label={t("Overdue")}
          value={totals.some((x) => x.overdue.gt(0)) ? totals.filter((x) => x.overdue.gt(0)).map((x) => <div key={x.currency}>{x.currency} {money(x.overdue, 0)}</div>) : t("None")}
          tone={totals.some((x) => x.overdue.gt(0)) ? "warn" : "default"}
        />
      </div>
      <Card padded={false}>
        <Table head={<tr><th>{t("Supplier")}</th><th className="num">{t("Balance")}</th>{agingHead}</tr>} empty={t("Nothing is owed to suppliers.")}>
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
