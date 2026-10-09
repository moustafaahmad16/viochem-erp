import { ActionForm } from "@/components/forms";
import { Badge, Card, PageHeader, RowLink, Table } from "@/components/ui";
import { getT } from "@/i18n/server";
import { currentUser } from "@/lib/auth";
import { money } from "@/lib/format";
import { accountLedgers } from "@/lib/services/banking";
import { createAccount } from "./actions";
import { AccountFields } from "./fields";

export async function generateMetadata() {
  return { title: (await getT())("Bank & cash") };
}

export default async function AccountsPage() {
  const [ledgers, user, t] = await Promise.all([accountLedgers(), currentUser(), getT()]);
  const totals = new Map<string, number>();
  for (const l of ledgers) if (l.account.active) totals.set(l.account.currency, (totals.get(l.account.currency) ?? 0) + l.balance.toNumber());
  return (
    <>
      <PageHeader
        title={t("Bank & cash")}
        subtitle={totals.size ? [...totals].map(([cur, v]) => `${cur} ${money(v)}`).join(" · ") : t("Add your bank accounts and cash box")}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <Table head={<tr><th>{t("Account")}</th><th>{t("Type")}</th><th>{t("Last movement")}</th><th className="num">{t("Balance")}</th></tr>} empty={t("No accounts yet.")}>
            {ledgers.map(({ account: a, ledger, balance }) => (
              <tr key={a.id} className={a.active ? "" : "text-slate-400"}>
                <td><RowLink href={`/accounts/${a.id}`}>{a.name}</RowLink>{!a.active && <span className="ms-2"><Badge>{t("Not in use")}</Badge></span>}</td>
                <td>{t(a.kind === "BANK" ? "Bank" : "Cash")}</td>
                <td>{t.date(ledger.at(-1)?.date)}</td>
                <td className={`num font-medium ${balance.lt(0) ? "text-red-700" : ""}`}>{a.currency} {money(balance)}</td>
              </tr>
            ))}
          </Table>
        </Card>
        {user?.role === "ADMIN" && (
          <Card title={t("Add an account")}>
            <ActionForm action={createAccount} resetOnSuccess>
              <AccountFields />
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
