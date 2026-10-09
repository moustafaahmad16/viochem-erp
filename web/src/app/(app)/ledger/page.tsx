import { ActionForm, Field, Select, Submit } from "@/components/forms";
import { Badge, ButtonLink, Card, PageHeader, Table } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { formatDate, today } from "@/lib/dates";
import { generalLedger, normal, SECTIONS, totals } from "@/lib/services/gl";
import type { LedgerSection } from "@prisma/client";
import { addLedgerAccount } from "./actions";
import { AccountLink, Amount, Warnings } from "./parts";

export const metadata = { title: "Chart of accounts" };

export default async function ChartPage() {
  const [gl, user] = await Promise.all([generalLedger(), currentUser()]);
  const now = today();
  const sums = totals(gl, { to: now });
  const sections = Object.keys(SECTIONS) as LedgerSection[];

  return (
    <>
      <PageHeader
        title="Chart of accounts"
        subtitle={`Balances on ${formatDate(now)}, in EGP. Invoices, shipments, payments and expenses post here by themselves.`}
        actions={
          <>
            <ButtonLink href="/ledger/trial-balance" variant="secondary">Trial balance</ButtonLink>
            <ButtonLink href="/ledger/balance-sheet" variant="secondary">Balance sheet</ButtonLink>
            <ButtonLink href="/ledger/journal">Journal</ButtonLink>
          </>
        }
      />
      <Warnings items={gl.warnings} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {sections.map((s) => {
            const accounts = gl.accounts.filter((a) => a.section === s);
            if (!accounts.length) return null;
            return (
              <Card key={s} title={SECTIONS[s].label} padded={false}>
                <Table head={<tr><th className="w-20">Code</th><th>Account</th><th className="num">Balance</th></tr>}>
                  {accounts.map((a) => (
                    <tr key={a.code} className={a.active ? "" : "text-slate-400"}>
                      <td className="font-mono text-xs text-slate-500">{a.code}</td>
                      <td>
                        <AccountLink code={a.code}>{a.name}</AccountLink>
                        {a.system && <span className="ml-2"><Badge color="blue">Automatic</Badge></span>}
                        {a.currency && a.currency !== "EGP" && <span className="ml-2"><Badge>{a.currency}</Badge></span>}
                        {!a.active && <span className="ml-2"><Badge>Not in use</Badge></span>}
                      </td>
                      <Amount v={normal(a.section, sums.get(a.code))} />
                    </tr>
                  ))}
                </Table>
              </Card>
            );
          })}
        </div>
        <div className="space-y-6">
          {user?.role === "ADMIN" && (
            <Card title="Add an account">
              <ActionForm action={addLedgerAccount} resetOnSuccess>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Code" name="code" required inputMode="numeric" maxLength={4} placeholder="6230" />
                  <Field label="Name" name="name" required className="col-span-2" />
                </div>
                <Select label="Section" name="section" required placeholder="Choose" options={sections.map((s) => ({ value: s, label: SECTIONS[s].label }))} />
                <p className="text-xs text-slate-500">An account under selling, administrative or finance costs also shows up as an expense category.</p>
                <Submit>Add account</Submit>
              </ActionForm>
            </Card>
          )}
          <Card title="How the codes work">
            <ul className="space-y-1 text-sm text-slate-600">
              <li><b>1</b> Assets: 1110 cash boxes and 1120 banks, one line each</li>
              <li><b>2</b> Liabilities</li>
              <li><b>3</b> Equity</li>
              <li><b>4</b> Income</li>
              <li><b>5</b> Cost of sales</li>
              <li><b>6</b> Expenses: 61 selling, 62 administrative, 63 finance</li>
              <li><b>7</b> Income tax</li>
            </ul>
            <p className="mt-3 text-xs text-slate-500">Accounts marked Automatic are kept from documents and can&apos;t take manual entries.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
