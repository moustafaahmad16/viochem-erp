import Decimal from "decimal.js";
import { ActionForm, Field, Select, Submit, TextArea, type FormState } from "@/components/forms";
import { Badge, RowLink, Table } from "@/components/ui";
import { toInputDate, today } from "@/lib/dates";
import { money } from "@/lib/format";
import { AGE_BUCKETS, daysLate } from "@/lib/ledger";
import type { Account } from "@/lib/services/accounts";
import { METHODS } from "@/lib/services/payments";
import { db } from "@/lib/db";
import { methodLabel } from "@/lib/services/accounts";
import { getT } from "@/i18n/server";
import { Tr } from "@/i18n/switch";
import type { T } from "@/i18n/core";

const methodOptions = (t: T) => METHODS.map((m) => ({ value: m, label: t(methodLabel(m)) }));

/** A statement line's detail, like "Bank transfer · 1234 · for INV-2026-0001", in the chosen language. */
export const statementDetail = (t: T, detail: string) =>
  detail
    .split(" · ")
    .map((part) => {
      const due = /^Due (\d{2} [A-Z][a-z]{2} \d{4})$/.exec(part);
      return due ? t("Due {date}", { date: t.date(new Date(`${due[1]} UTC`)) }) : t.message(part);
    })
    .join(" · ");

type Option = { value: string | number; label: string };

/** Accounts money can go into or come out of, for a form's select box. */
export async function accountOptions({ egpOnly = false } = {}): Promise<Option[]> {
  const accounts = await db.moneyAccount.findMany({ where: { active: true, ...(egpOnly ? { currency: "EGP" } : {}) }, orderBy: [{ kind: "asc" }, { name: "asc" }] });
  return accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` }));
}

export async function AccountSelect({ label, accounts }: { label: string; accounts: Option[] }) {
  const t = await getT();
  return (
    <Select
      label={t(label)}
      name="accountId"
      defaultValue={accounts[0]?.value ?? ""}
      placeholder={t("Not recorded")}
      options={accounts}
      hint={accounts.length ? undefined : t("Add your bank accounts and cash box under Bank & cash to track balances.")}
    />
  );
}

/** One line per bill still open, with how late it is. */
export async function OpenBills({ account }: { account: Account }) {
  const t = await getT();
  const now = today();
  const open = account.bills.filter((b) => b.outstanding.gt(0));
  return (
    <Table
      head={<tr><th>{t("Bill")}</th><th>{t("Date")}</th><th>{t("Due")}</th><th className="num">{t("Amount")}</th><th className="num">{t("Paid")}</th><th className="num">{t("Still owed")}</th></tr>}
      empty={t("Nothing is owed.")}
    >
      {open.map((b) => {
        const late = daysLate(b.dueDate, now);
        return (
          <tr key={String(b.key)}>
            <td>{b.href ? <RowLink href={b.href}>{b.label}</RowLink> : t(b.label)}</td>
            <td>{t.date(b.date)}</td>
            <td>
              {t.date(b.dueDate)}
              {late > 0 && <span className="ms-2"><Badge color={late > 60 ? "red" : "amber"}>{t("{n} days late", { n: late })}</Badge></span>}
            </td>
            <td className="num">{money(b.amount)}</td>
            <td className="num">{b.paid.isZero() ? "" : money(b.paid)}</td>
            <td className="num font-medium">{money(b.outstanding)}</td>
          </tr>
        );
      })}
    </Table>
  );
}

/** Every bill and payment in date order, with the balance after each, like a printed statement. */
export async function Statement({ account, onDelete }: { account: Account; onDelete?: Map<string, () => Promise<void>> }) {
  const t = await getT();
  return (
    <Table
      head={<tr><th>{t("Date")}</th><th>{t("Document")}</th><th className="num">{t("Billed")}</th><th className="num">{t("Paid")}</th><th className="num">{t("Balance")}</th><th /></tr>}
      empty={t("Nothing yet.")}
    >
      {account.statement.map((l, i) => {
        const del = onDelete?.get(l.label);
        return (
          <tr key={i}>
            <td>{t.date(l.date)}</td>
            <td>
              {l.href ? <RowLink href={l.href}>{l.label}</RowLink> : t(l.label)}
              {l.detail && <div className="text-xs text-slate-500">{statementDetail(t, l.detail)}</div>}
            </td>
            <td className="num">{l.charge.isZero() ? "" : money(l.charge)}</td>
            <td className="num">{l.payment.isZero() ? "" : money(l.payment)}</td>
            <td className={`num font-medium ${l.balance.lt(0) ? "text-brand-700" : ""}`}>{money(l.balance)}</td>
            <td className="text-end">
              {del && (
                <form action={del}>
                  <button className="text-xs text-slate-400 hover:text-red-600">{t("Delete")}</button>
                </form>
              )}
            </td>
          </tr>
        );
      })}
    </Table>
  );
}

export function AgingCells({ aging }: { aging: Decimal[] }) {
  return aging.map((v, i) => (
    <td key={i} className={`num ${i >= 3 && v.gt(0) ? "text-red-700" : i >= 1 && v.gt(0) ? "text-amber-700" : ""}`}>
      {v.isZero() ? "" : money(v, 0)}
    </td>
  ));
}

export const agingHead = AGE_BUCKETS.map((b) => <th key={b} className="num"><Tr>{b}</Tr></th>);

/** "EGP 12,000" or "EGP 12,000 credit" when they have paid ahead. */
export async function Balance({ value, currency }: { value: Decimal; currency: string }) {
  const t = await getT();
  if (value.isZero()) return <span className="text-slate-500">{t("Settled")}</span>;
  const prefix = currency ? `${currency} ` : "";
  return value.lt(0) ? <span className="text-brand-700">{prefix}{money(value.neg())} {t("credit")}</span> : <>{prefix}{money(value)}</>;
}

export async function ReceivePaymentForm({ action, bills, accounts }: { action: (s: FormState, fd: FormData) => Promise<FormState>; bills: Account["bills"]; accounts: Option[] }) {
  const t = await getT();
  const open = bills.filter((b) => b.outstanding.gt(0) && b.key !== "opening");
  return (
    <ActionForm action={action} resetOnSuccess>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Amount (EGP)")} name="amount" inputMode="decimal" required />
        <Field label={t("Date")} name="date" type="date" defaultValue={toInputDate(today())} required />
      </div>
      <Select label={t("Paid by")} name="method" options={methodOptions(t)} />
      <AccountSelect label={t("Into account")} accounts={accounts} />
      <Field label={t("Reference")} name="reference" hint={t("Cheque or transfer number")} />
      <Select
        label={t("For invoice")}
        name="invoiceId"
        placeholder={t("Oldest unpaid first")}
        options={open.map((b) => ({ value: String(b.key).replace("inv:", ""), label: `${b.label} · ${t("{amount} owed", { amount: money(b.outstanding) })}` }))}
      />
      <TextArea label={t("Notes")} name="notes" />
      <Submit>{t("Save payment")}</Submit>
    </ActionForm>
  );
}

export async function PaySupplierForm({
  action,
  currency,
  currencies,
  shipments,
  accounts,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  currency: string;
  currencies: { value: string; label: string }[];
  shipments: { id: number; label: string }[];
  accounts: Option[];
}) {
  const t = await getT();
  return (
    <ActionForm action={action} resetOnSuccess>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Amount")} name="amount" inputMode="decimal" required />
        <Select label={t("Currency")} name="currency" defaultValue={currency} options={currencies} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Date")} name="date" type="date" defaultValue={toInputDate(today())} required />
        <Field label={t("Exchange rate")} name="fxRate" inputMode="decimal" hint={t("EGP for 1 unit. Not needed for EGP.")} />
      </div>
      <Select label={t("Paid by")} name="method" options={methodOptions(t)} />
      <AccountSelect label={t("From account")} accounts={accounts} />
      <Field label={t("Reference")} name="reference" hint={t("Swift or transfer number")} />
      <Select label={t("For shipment")} name="shipmentId" placeholder={t("Oldest unpaid first")} options={shipments.map((s) => ({ value: s.id, label: s.label }))} />
      <TextArea label={t("Notes")} name="notes" />
      <Submit>{t("Save payment")}</Submit>
    </ActionForm>
  );
}
