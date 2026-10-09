import Decimal from "decimal.js";
import { ActionForm, Field, Select, Submit, TextArea, type FormState } from "@/components/forms";
import { Badge, RowLink, Table } from "@/components/ui";
import { formatDate, toInputDate, today } from "@/lib/dates";
import { money } from "@/lib/format";
import { AGE_BUCKETS, daysLate } from "@/lib/ledger";
import type { Account } from "@/lib/services/accounts";
import { METHODS } from "@/lib/services/payments";
import { methodLabel } from "@/lib/services/accounts";

const methodOptions = METHODS.map((m) => ({ value: m, label: methodLabel(m) }));

/** One line per bill still open, with how late it is. */
export function OpenBills({ account }: { account: Account }) {
  const now = today();
  const open = account.bills.filter((b) => b.outstanding.gt(0));
  return (
    <Table
      head={<tr><th>Bill</th><th>Date</th><th>Due</th><th className="num">Amount</th><th className="num">Paid</th><th className="num">Still owed</th></tr>}
      empty="Nothing is owed."
    >
      {open.map((b) => {
        const late = daysLate(b.dueDate, now);
        return (
          <tr key={String(b.key)}>
            <td>{b.href ? <RowLink href={b.href}>{b.label}</RowLink> : b.label}</td>
            <td>{formatDate(b.date)}</td>
            <td>
              {formatDate(b.dueDate)}
              {late > 0 && <span className="ml-2"><Badge color={late > 60 ? "red" : "amber"}>{late} days late</Badge></span>}
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
export function Statement({ account, onDelete }: { account: Account; onDelete?: Map<string, () => Promise<void>> }) {
  return (
    <Table
      head={<tr><th>Date</th><th>Document</th><th className="num">Billed</th><th className="num">Paid</th><th className="num">Balance</th><th /></tr>}
      empty="Nothing yet."
    >
      {account.statement.map((l, i) => {
        const del = onDelete?.get(l.label);
        return (
          <tr key={i}>
            <td>{formatDate(l.date)}</td>
            <td>
              {l.href ? <RowLink href={l.href}>{l.label}</RowLink> : l.label}
              {l.detail && <div className="text-xs text-slate-500">{l.detail}</div>}
            </td>
            <td className="num">{l.charge.isZero() ? "" : money(l.charge)}</td>
            <td className="num">{l.payment.isZero() ? "" : money(l.payment)}</td>
            <td className={`num font-medium ${l.balance.lt(0) ? "text-brand-700" : ""}`}>{money(l.balance)}</td>
            <td className="text-right">
              {del && (
                <form action={del}>
                  <button className="text-xs text-slate-400 hover:text-red-600">Delete</button>
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

export const agingHead = AGE_BUCKETS.map((b) => <th key={b} className="num">{b}</th>);

/** "EGP 12,000" or "EGP 12,000 credit" when they have paid ahead. */
export function Balance({ value, currency }: { value: Decimal; currency: string }) {
  if (value.isZero()) return <span className="text-slate-500">Settled</span>;
  const prefix = currency ? `${currency} ` : "";
  return value.lt(0) ? <span className="text-brand-700">{prefix}{money(value.neg())} credit</span> : <>{prefix}{money(value)}</>;
}

export function ReceivePaymentForm({ action, bills }: { action: (s: FormState, fd: FormData) => Promise<FormState>; bills: Account["bills"] }) {
  const open = bills.filter((b) => b.outstanding.gt(0) && b.key !== "opening");
  return (
    <ActionForm action={action} resetOnSuccess>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (EGP)" name="amount" inputMode="decimal" required />
        <Field label="Date" name="date" type="date" defaultValue={toInputDate(today())} required />
      </div>
      <Select label="Paid by" name="method" options={methodOptions} />
      <Field label="Reference" name="reference" hint="Cheque or transfer number" />
      <Select
        label="For invoice"
        name="invoiceId"
        placeholder="Oldest unpaid first"
        options={open.map((b) => ({ value: String(b.key).replace("inv:", ""), label: `${b.label} · ${money(b.outstanding)} owed` }))}
      />
      <TextArea label="Notes" name="notes" />
      <Submit>Save payment</Submit>
    </ActionForm>
  );
}

export function PaySupplierForm({
  action,
  currency,
  currencies,
  shipments,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  currency: string;
  currencies: { value: string; label: string }[];
  shipments: { id: number; label: string }[];
}) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount" name="amount" inputMode="decimal" required />
        <Select label="Currency" name="currency" defaultValue={currency} options={currencies} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" name="date" type="date" defaultValue={toInputDate(today())} required />
        <Field label="Exchange rate" name="fxRate" inputMode="decimal" hint="EGP for 1 unit. Not needed for EGP." />
      </div>
      <Select label="Paid by" name="method" options={methodOptions} />
      <Field label="Reference" name="reference" hint="Swift or transfer number" />
      <Select label="For shipment" name="shipmentId" placeholder="Oldest unpaid first" options={shipments.map((s) => ({ value: s.id, label: s.label }))} />
      <TextArea label="Notes" name="notes" />
      <Submit>Save payment</Submit>
    </ActionForm>
  );
}
