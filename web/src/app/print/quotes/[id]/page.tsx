import Decimal from "decimal.js";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { invoiceTotals } from "@/lib/costing";
import { formatDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { money, qty } from "@/lib/format";
import { PrintButton } from "../../invoices/[id]/print-button";

export const metadata = { title: "Quotation" };

/** Bilingual (English / Arabic) quotation, laid out for A4. */
export default async function PrintQuotePage({ params }: PageProps<"/print/quotes/[id]">) {
  await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const q = await db.quote.findUnique({
    where: { id },
    include: { customer: true, lines: { include: { item: true }, orderBy: { id: "asc" } } },
  });
  if (!q) notFound();
  const totals = invoiceTotals(q.lines, q.vatRate.toString());

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end print:hidden">
        <PrintButton />
      </div>
      <article dir="ltr" className="mx-auto max-w-[210mm] bg-white p-12 text-[13px] text-slate-900 shadow print:p-0 print:shadow-none">
        {q.status === "DECLINED" && <div className="mb-4 rounded border-2 border-red-600 py-2 text-center text-lg font-bold text-red-600">DECLINED · مرفوض</div>}
        <header className="flex items-start justify-between border-b-2 border-brand-600 pb-5 shadow-[0_2px_0_0_var(--color-accent-500)]">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Viochem for Trading and Industry" className="h-16 w-auto" />
          </div>
          <div className="text-right">
            <div className="text-xl font-semibold">Quotation</div>
            <div className="text-xl font-semibold" dir="rtl">عرض سعر</div>
          </div>
        </header>

        <section className="mt-6 grid grid-cols-2 gap-8">
          <div>
            <div className="text-xs uppercase text-slate-500">Prepared for · مقدم إلى</div>
            <div className="mt-1 text-base font-semibold">{q.customer.name}</div>
            {q.customer.address && <div className="whitespace-pre-line text-slate-600">{q.customer.address}</div>}
            {q.customer.taxId && <div className="text-slate-600">Tax no. · رقم التسجيل الضريبي: {q.customer.taxId}</div>}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 self-start text-right">
            <dt className="text-slate-500">Quotation no. · رقم العرض</dt>
            <dd className="font-semibold">{q.number}</dd>
            <dt className="text-slate-500">Date · التاريخ</dt>
            <dd>{formatDate(q.date)}</dd>
            {q.validUntil && (
              <>
                <dt className="text-slate-500">Valid until · صالح حتى</dt>
                <dd>{formatDate(q.validUntil)}</dd>
              </>
            )}
          </dl>
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
            {q.lines.map((l) => (
              <tr key={l.id} className="border-b border-slate-100 [&>td]:py-2.5">
                <td>
                  <div className="font-medium">{l.item.name}</div>
                  {l.item.casNumber && <div className="text-xs text-slate-500">CAS {l.item.casNumber}</div>}
                </td>
                <td className="num">{qty(l.qty)} {l.item.unit}</td>
                <td className="num">{money(l.unitPrice)}</td>
                <td className="num">{money(new Decimal(l.qty.toString()).times(l.unitPrice.toString()))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 ml-auto w-72 space-y-1">
          <div className="flex justify-between"><span className="text-slate-500">Subtotal · الإجمالي قبل الضريبة</span><span className="num">{money(totals.net)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">VAT {q.vatRate.toString()}% · ضريبة القيمة المضافة</span><span className="num">{money(totals.vat)}</span></div>
          <div className="flex justify-between border-t-2 border-slate-900 pt-2 text-base font-bold"><span>Total EGP · الإجمالي</span><span className="num">{money(totals.total)}</span></div>
        </div>

        {q.notes && <p className="mt-10 whitespace-pre-line text-slate-600">{q.notes}</p>}
        {q.validUntil && (
          <p className="mt-8 text-xs text-slate-500">
            Prices are valid until {formatDate(q.validUntil)}. · <span dir="rtl">الأسعار سارية حتى {formatDate(q.validUntil)}.</span>
          </p>
        )}
      </article>
    </div>
  );
}
