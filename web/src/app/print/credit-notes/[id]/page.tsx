import Decimal from "decimal.js";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { money, qty } from "@/lib/format";
import { creditTotals } from "@/lib/services/credits";
import { PrintButton } from "../../invoices/[id]/print-button";

export const metadata = { title: "Credit note" };

/** Bilingual (English / Arabic) credit note, laid out for A4. */
export default async function PrintCreditNotePage({ params }: PageProps<"/print/credit-notes/[id]">) {
  await requireUser();
  const id = Number((await params).id);
  const cn = await db.creditNote.findUnique({
    where: { id },
    include: { customer: true, invoice: true, lines: { include: { invoiceLine: { include: { item: true } } }, orderBy: { id: "asc" } } },
  });
  if (!cn || cn.status === "DRAFT") notFound();
  const totals = creditTotals(cn);

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end print:hidden">
        <PrintButton />
      </div>
      <article dir="ltr" className="mx-auto max-w-[210mm] bg-white p-12 text-[13px] text-slate-900 shadow print:p-0 print:shadow-none">
        {cn.status === "CANCELLED" && <div className="mb-4 rounded border-2 border-red-600 py-2 text-center text-lg font-bold text-red-600">CANCELLED · ملغى</div>}
        <header className="flex items-start justify-between border-b-2 border-brand-600 pb-5 shadow-[0_2px_0_0_var(--color-accent-500)]">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Viochem for Trading and Industry" className="h-16 w-auto" />
          </div>
          <div className="text-right">
            <div className="text-xl font-semibold">Credit note</div>
            <div className="text-xl font-semibold" dir="rtl">إشعار دائن</div>
          </div>
        </header>

        <section className="mt-6 grid grid-cols-2 gap-8">
          <div>
            <div className="text-xs uppercase text-slate-500">Customer · العميل</div>
            <div className="mt-1 text-base font-semibold">{cn.customer.name}</div>
            {cn.customer.address && <div className="whitespace-pre-line text-slate-600">{cn.customer.address}</div>}
            {cn.customer.taxId && <div className="text-slate-600">Tax no. · رقم التسجيل الضريبي: {cn.customer.taxId}</div>}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 self-start text-right">
            <dt className="text-slate-500">Credit note no. · رقم الإشعار</dt>
            <dd className="font-semibold">{cn.number}</dd>
            <dt className="text-slate-500">Date · التاريخ</dt>
            <dd>{formatDate(cn.date)}</dd>
            <dt className="text-slate-500">For invoice · عن الفاتورة</dt>
            <dd>{cn.invoice.number} · {formatDate(cn.invoice.date)}</dd>
          </dl>
        </section>

        <section className="mt-6">
          <div className="text-xs uppercase text-slate-500">Reason · السبب</div>
          <p className="mt-1 whitespace-pre-line">{cn.reason}</p>
        </section>

        <table className="mt-8 w-full">
          <thead>
            <tr className="border-b border-slate-300 text-left text-xs text-slate-500 [&>th]:pb-2">
              <th>Product · الصنف</th>
              <th className="text-right">Qty · الكمية</th>
              <th className="text-right">Price · السعر</th>
              <th className="text-right">Amount · القيمة</th>
            </tr>
          </thead>
          <tbody>
            {cn.lines.map((l) => (
              <tr key={l.id} className="border-b border-slate-100 [&>td]:py-2.5">
                <td>
                  <div className="font-medium">{l.invoiceLine.item.name}</div>
                  <div className="text-xs text-slate-500">{l.restock ? "Goods returned · بضاعة مرتجعة" : "Price reduction · تخفيض في السعر"}</div>
                </td>
                <td className="num">{qty(l.qty)} {l.invoiceLine.item.unit}</td>
                <td className="num">{money(l.unitPrice)}</td>
                <td className="num">{money(new Decimal(l.qty.toString()).times(l.unitPrice.toString()))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 ml-auto w-72 space-y-1">
          <div className="flex justify-between"><span className="text-slate-500">Subtotal · الإجمالي قبل الضريبة</span><span className="num">{money(totals.net)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">VAT {cn.vatRate.toString()}% · ضريبة القيمة المضافة</span><span className="num">{money(totals.vat)}</span></div>
          <div className="flex justify-between border-t-2 border-slate-900 pt-2 text-base font-bold"><span>Total credited EGP · إجمالي الإشعار</span><span className="num">{money(totals.total)}</span></div>
        </div>
      </article>
    </div>
  );
}
