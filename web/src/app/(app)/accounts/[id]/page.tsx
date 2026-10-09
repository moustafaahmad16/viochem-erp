import { notFound } from "next/navigation";
import { ActionForm, Field, Select, Submit, TextArea } from "@/components/forms";
import { Card, PageHeader, RowLink, Stat, Table } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { formatDate, toInputDate, today } from "@/lib/dates";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { accountLedgers } from "@/lib/services/banking";
import { transfer, updateAccount } from "../actions";
import { AccountFields } from "../fields";

export default async function AccountPage({ params }: PageProps<"/accounts/[id]">) {
  const id = Number((await params).id);
  const [[l], user, others] = await Promise.all([
    accountLedgers({ id }),
    currentUser(),
    db.moneyAccount.findMany({ where: { active: true, id: { not: id } }, orderBy: { name: "asc" } }),
  ]);
  if (!l) notFound();
  const a = l.account;
  const now = today();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const thisMonth = l.ledger.filter((m) => m.date >= monthStart);
  const inflow = thisMonth.filter((m) => m.amount.gt(0) && m.label !== "Opening balance").reduce((s, m) => s + m.amount.toNumber(), 0);
  const outflow = thisMonth.filter((m) => m.amount.lt(0)).reduce((s, m) => s - m.amount.toNumber(), 0);

  return (
    <>
      <PageHeader title={a.name} subtitle={`${a.kind === "BANK" ? "Bank account" : "Cash"} · ${a.currency}`} back={{ href: "/accounts", label: "Bank & cash" }} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Balance" value={`${a.currency} ${money(l.balance)}`} tone={l.balance.lt(0) ? "warn" : "default"} />
        <Stat label="In this month" value={`${a.currency} ${money(inflow)}`} />
        <Stat label="Out this month" value={`${a.currency} ${money(outflow)}`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Movements" padded={false} className="lg:col-span-2">
          <Table head={<tr><th>Date</th><th>What</th><th className="num">In</th><th className="num">Out</th><th className="num">Balance</th></tr>} empty="Nothing has gone in or out yet.">
            {[...l.ledger].reverse().map((m, i) => (
              <tr key={i}>
                <td>{formatDate(m.date)}</td>
                <td>
                  {m.href ? <RowLink href={m.href}>{m.label}</RowLink> : m.label}
                  {m.detail && <div className="text-xs text-slate-500">{m.detail}</div>}
                </td>
                <td className="num">{m.amount.gt(0) ? money(m.amount) : ""}</td>
                <td className="num">{m.amount.lt(0) ? money(m.amount.neg()) : ""}</td>
                <td className="num font-medium">{money(m.balance)}</td>
              </tr>
            ))}
          </Table>
        </Card>
        <div className="space-y-6">
          {a.active && others.length > 0 && (
            <Card title="Move money to another account">
              <ActionForm action={transfer.bind(null, a.id)} resetOnSuccess>
                <Select label="To" name="toAccountId" options={others.map((o) => ({ value: o.id, label: `${o.name} (${o.currency})` }))} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label={`Amount (${a.currency})`} name="amount" inputMode="decimal" required />
                  <Field label="Date" name="date" type="date" defaultValue={toInputDate(today())} required />
                </div>
                <Field label="Amount received" name="toAmount" inputMode="decimal" hint="Only when the other account is in a different currency" />
                <TextArea label="Note" name="note" />
                <Submit variant="secondary">Save transfer</Submit>
              </ActionForm>
            </Card>
          )}
          {user?.role === "ADMIN" && (
            <Card title="Details">
              <ActionForm action={updateAccount.bind(null, a.id)}>
                <AccountFields a={a} />
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
