import { ActionForm } from "@/components/forms";
import { Badge, Card, PageHeader, RowLink, Table } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { money } from "@/lib/format";
import { accountLedgers } from "@/lib/services/banking";
import { createAccount } from "./actions";
import { AccountFields } from "./fields";

export const metadata = { title: "Bank & cash" };

export default async function AccountsPage() {
  const [ledgers, user] = await Promise.all([accountLedgers(), currentUser()]);
  const totals = new Map<string, number>();
  for (const l of ledgers) if (l.account.active) totals.set(l.account.currency, (totals.get(l.account.currency) ?? 0) + l.balance.toNumber());
  return (
    <>
      <PageHeader
        title="Bank & cash"
        subtitle={totals.size ? [...totals].map(([cur, v]) => `${cur} ${money(v)}`).join(" · ") : "Add your bank accounts and cash box"}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <Table head={<tr><th>Account</th><th>Type</th><th>Last movement</th><th className="num">Balance</th></tr>} empty="No accounts yet.">
            {ledgers.map(({ account: a, ledger, balance }) => (
              <tr key={a.id} className={a.active ? "" : "text-slate-400"}>
                <td><RowLink href={`/accounts/${a.id}`}>{a.name}</RowLink>{!a.active && <span className="ml-2"><Badge>Not in use</Badge></span>}</td>
                <td>{a.kind === "BANK" ? "Bank" : "Cash"}</td>
                <td>{formatDate(ledger.at(-1)?.date)}</td>
                <td className={`num font-medium ${balance.lt(0) ? "text-red-700" : ""}`}>{a.currency} {money(balance)}</td>
              </tr>
            ))}
          </Table>
        </Card>
        {user?.role === "ADMIN" && (
          <Card title="Add an account">
            <ActionForm action={createAccount} resetOnSuccess>
              <AccountFields />
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
