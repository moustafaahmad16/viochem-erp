import { ActionForm, Field, Select, Submit } from "@/components/forms";
import { Badge, ButtonLink, Card, PageHeader, Table } from "@/components/ui";
import { getT } from "@/i18n/server";
import { currentUser } from "@/lib/auth";
import { today } from "@/lib/dates";
import { generalLedger, normal, SECTIONS, totals } from "@/lib/services/gl";
import type { LedgerSection } from "@prisma/client";
import { addLedgerAccount } from "./actions";
import { AccountLink, Amount, Warnings } from "./parts";

export async function generateMetadata() {
  return { title: (await getT())("Chart of accounts") };
}

export default async function ChartPage() {
  const [gl, user, t] = await Promise.all([generalLedger(), currentUser(), getT()]);
  const now = today();
  const sums = totals(gl, { to: now });
  const sections = Object.keys(SECTIONS) as LedgerSection[];

  return (
    <>
      <PageHeader
        title={t("Chart of accounts")}
        subtitle={t("Balances on {date}, in EGP. Invoices, shipments, payments and expenses post here by themselves.", { date: t.date(now) })}
        actions={
          <>
            <ButtonLink href="/ledger/trial-balance" variant="secondary">{t("Trial balance")}</ButtonLink>
            <ButtonLink href="/ledger/balance-sheet" variant="secondary">{t("Balance sheet")}</ButtonLink>
            <ButtonLink href="/ledger/journal">{t("Journal")}</ButtonLink>
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
              <Card key={s} title={t(SECTIONS[s].label)} padded={false}>
                <Table head={<tr><th className="w-20">{t("Code")}</th><th>{t("Account")}</th><th className="num">{t("Balance")}</th></tr>}>
                  {accounts.map((a) => (
                    <tr key={a.code} className={a.active ? "" : "text-slate-400"}>
                      <td className="font-mono text-xs text-slate-500">{a.code}</td>
                      <td>
                        <AccountLink code={a.code}>{t(a.name)}</AccountLink>
                        {a.system && <span className="ms-2"><Badge color="blue">{t("Automatic")}</Badge></span>}
                        {a.currency && a.currency !== "EGP" && <span className="ms-2"><Badge>{a.currency}</Badge></span>}
                        {!a.active && <span className="ms-2"><Badge>{t("Not in use")}</Badge></span>}
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
            <Card title={t("Add an account")}>
              <ActionForm action={addLedgerAccount} resetOnSuccess>
                <div className="grid grid-cols-3 gap-3">
                  <Field label={t("Code")} name="code" required inputMode="numeric" maxLength={4} placeholder="6230" />
                  <Field label={t("Name")} name="name" required className="col-span-2" />
                </div>
                <Select label={t("Section")} name="section" required placeholder={t("Choose")} options={sections.map((s) => ({ value: s, label: t(SECTIONS[s].label) }))} />
                <p className="text-xs text-slate-500">{t("An account under selling, administrative or finance costs also shows up as an expense category.")}</p>
                <Submit>{t("Add account")}</Submit>
              </ActionForm>
            </Card>
          )}
          <Card title={t("How the codes work")}>
            <ul className="space-y-1 text-sm text-slate-600">
              <li><b>1</b> {t("Assets: 1110 cash boxes and 1120 banks, one line each")}</li>
              <li><b>2</b> {t("Liabilities")}</li>
              <li><b>3</b> {t("Equity")}</li>
              <li><b>4</b> {t("Income")}</li>
              <li><b>5</b> {t("Cost of sales")}</li>
              <li><b>6</b> {t("Expenses: 61 selling, 62 administrative, 63 finance")}</li>
              <li><b>7</b> {t("Income tax")}</li>
            </ul>
            <p className="mt-3 text-xs text-slate-500">{t("Accounts marked Automatic are kept from documents and can't take manual entries.")}</p>
          </Card>
        </div>
      </div>
    </>
  );
}
