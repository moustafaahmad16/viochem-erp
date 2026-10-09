import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { formatDate, today } from "@/lib/dates";
import { money } from "@/lib/format";
import { AGE_BUCKETS } from "@/lib/ledger";
import { customerAccounts } from "@/lib/services/accounts";
import { PrintButton } from "../../invoices/[id]/print-button";

export const metadata = { title: "Statement" };

/** Bilingual customer statement of account (كشف حساب), laid out for A4. */
export default async function PrintStatementPage({ params }: PageProps<"/print/statements/[id]">) {
  await requireUser();
  const [acc] = await customerAccounts({ id: Number((await params).id) });
  if (!acc) notFound();
  const c = acc.customer;

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end print:hidden">
        <PrintButton />
      </div>
      <article className="mx-auto max-w-[210mm] bg-white p-12 text-[13px] text-slate-900 shadow print:p-0 print:shadow-none">
        <header className="flex items-start justify-between border-b-2 border-brand-600 pb-5">
          <div>
            <div className="text-2xl font-bold tracking-tight text-brand-700">VIOCHEM</div>
            <div className="text-slate-500">Aroma chemicals</div>
          </div>
          <div className="text-right">
            <div className="text-xl font-semibold">Statement of account</div>
            <div className="text-xl font-semibold" dir="rtl">كشف حساب</div>
          </div>
        </header>

        <section className="mt-6 grid grid-cols-2 gap-8">
          <div>
            <div className="text-xs uppercase text-slate-500">Customer · العميل</div>
            <div className="mt-1 text-base font-semibold">{c.name}</div>
            {c.address && <div className="whitespace-pre-line text-slate-600">{c.address}</div>}
            {c.taxId && <div className="text-slate-600">Tax no. · رقم التسجيل الضريبي: {c.taxId}</div>}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 self-start text-right">
            <dt className="text-slate-500">Date · التاريخ</dt>
            <dd>{formatDate(today())}</dd>
            <dt className="text-slate-500">Balance due · الرصيد المستحق</dt>
            <dd className="font-semibold">EGP {money(acc.balance)}</dd>
          </dl>
        </section>

        <table className="mt-8 w-full">
          <thead>
            <tr className="border-b border-slate-300 text-left text-xs text-slate-500 [&>th]:pb-2">
              <th>Date · التاريخ</th>
              <th>Document · المستند</th>
              <th className="text-right">Debit · مدين</th>
              <th className="text-right">Credit · دائن</th>
              <th className="text-right">Balance · الرصيد</th>
            </tr>
          </thead>
          <tbody>
            {acc.statement.map((l, i) => (
              <tr key={i} className="border-b border-slate-100 [&>td]:py-2">
                <td>{formatDate(l.date)}</td>
                <td>
                  {l.label}
                  {l.detail && <div className="text-xs text-slate-500">{l.detail}</div>}
                </td>
                <td className="text-right tabular-nums">{l.charge.isZero() ? "" : money(l.charge)}</td>
                <td className="text-right tabular-nums">{l.payment.isZero() ? "" : money(l.payment)}</td>
                <td className="text-right font-medium tabular-nums">{money(l.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className="mt-8 w-full text-center">
          <thead>
            <tr className="text-xs text-slate-500">{AGE_BUCKETS.map((b) => <th key={b} className="pb-1 font-normal">{b}</th>)}</tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-300 [&>td]:pt-2">{acc.aging.map((v, i) => <td key={i} className="tabular-nums">{money(v)}</td>)}</tr>
          </tbody>
        </table>

        <p className="mt-10 text-xs text-slate-500">Amounts in Egyptian pounds · المبالغ بالجنيه المصري</p>
      </article>
    </div>
  );
}
