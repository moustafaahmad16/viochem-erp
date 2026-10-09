import Decimal from "decimal.js";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { invoiceTotals } from "@/lib/costing";
import { formatDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { money, qty } from "@/lib/format";
import { PrintButton } from "./print-button";

export const metadata = { title: "Invoice" };

/** Bilingual (English / Arabic) tax invoice, laid out for A4. */
export default async function PrintInvoicePage({ params }: PageProps<"/print/invoices/[id]">) {
  await requireUser();
  const id = Number((await params).id);
  const inv = await db.invoice.findUnique({
    where: { id },
    include: { customer: true, lines: { include: { item: true }, orderBy: { id: "asc" } } },
  });
  if (!inv || inv.status === "DRAFT") notFound();
  const totals = invoiceTotals(inv.lines, inv.vatRate.toString());

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end print:hidden">
        <PrintButton />
      </div>
      <article className="mx-auto max-w-[210mm] bg-white p-12 text-[13px] text-slate-900 shadow print:p-0 print:shadow-none">
        {inv.status === "CANCELLED" && <div className="mb-4 rounded border-2 border-red-600 py-2 text-center text-lg font-bold text-red-600">CANCELLED · ملغاة</div>}
        <header className="flex items-start justify-between border-b-2 border-brand-600 pb-5 shadow-[0_2px_0_0_var(--color-accent-500)]">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Viochem for Trading and Industry" className="h-16 w-auto" />
          </div>
          <div className="text-end">
            <div className="text-xl font-semibold">Tax Invoice</div>
            <div className="text-xl font-semibold" dir="rtl">فاتورة ضريبية</div>
          </div>
        </header>

        <section className="mt-6 grid grid-cols-2 gap-8">
          <div>
            <div className="text-xs uppercase text-slate-500">Bill to · العميل</div>
            <div className="mt-1 text-base font-semibold">{inv.customer.name}</div>
            {inv.customer.address && <div className="whitespace-pre-line text-slate-600">{inv.customer.address}</div>}
            {inv.customer.taxId && <div className="text-slate-600">Tax no. · رقم التسجيل الضريبي: {inv.customer.taxId}</div>}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 self-start text-end">
            <dt className="text-slate-500">Invoice no. · رقم الفاتورة</dt>
            <dd className="font-semibold">{inv.number}</dd>
            <dt className="text-slate-500">Date · التاريخ</dt>
            <dd>{formatDate(inv.date)}</dd>
            {inv.dueDate && (
              <>
                <dt className="text-slate-500">Due · تاريخ الاستحقاق</dt>
                <dd>{formatDate(inv.dueDate)}</dd>
              </>
            )}
          </dl>
        </section>

        <table className="mt-8 w-full">
          <thead>
            <tr className="border-b border-slate-300 text-start text-xs text-slate-500 [&>th]:pb-2">
              <th>Product · الصنف</th>
              <th className="text-end">Qty · الكمية</th>
              <th className="text-end">Price · السعر</th>
              <th className="text-end">Amount · القيمة</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l) => (
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

        <div className="mt-6 ms-auto w-72 space-y-1">
          <div className="flex justify-between"><span className="text-slate-500">Subtotal · الإجمالي قبل الضريبة</span><span className="num">{money(totals.net)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">VAT {inv.vatRate.toString()}% · ضريبة القيمة المضافة</span><span className="num">{money(totals.vat)}</span></div>
          <div className="flex justify-between border-t-2 border-slate-900 pt-2 text-base font-bold"><span>Total EGP · الإجمالي</span><span className="num">{money(totals.total)}</span></div>
        </div>

        {inv.notes && <p className="mt-10 whitespace-pre-line text-slate-600">{inv.notes}</p>}
      </article>
    </div>
  );
}
