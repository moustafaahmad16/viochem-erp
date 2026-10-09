import Decimal from "decimal.js";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { money, qty } from "@/lib/format";
import { PrintButton } from "../../invoices/[id]/print-button";

export const metadata = { title: "Purchase order" };

/** Bilingual (English / Arabic) purchase order to send to the supplier, laid out for A4. */
export default async function PrintPurchaseOrderPage({ params }: PageProps<"/print/purchase-orders/[id]">) {
  await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const order = await db.purchaseOrder.findUnique({
    where: { id },
    include: { supplier: true, lines: { include: { item: true }, orderBy: { id: "asc" } } },
  });
  if (!order) notFound();
  const total = order.lines.reduce((s, l) => s.plus(new Decimal(l.qty.toString()).times(l.unitPrice.toString())), new Decimal(0));

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end print:hidden">
        <PrintButton />
      </div>
      <article dir="ltr" className="mx-auto max-w-[210mm] bg-white p-12 text-[13px] text-slate-900 shadow print:p-0 print:shadow-none">
        {order.status === "CANCELLED" && <div className="mb-4 rounded border-2 border-red-600 py-2 text-center text-lg font-bold text-red-600">CANCELLED · ملغى</div>}
        <header className="flex items-start justify-between border-b-2 border-brand-600 pb-5 shadow-[0_2px_0_0_var(--color-accent-500)]">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Viochem for Trading and Industry" className="h-16 w-auto" />
          </div>
          <div className="text-right">
            <div className="text-xl font-semibold">Purchase order</div>
            <div className="text-xl font-semibold" dir="rtl">أمر شراء</div>
          </div>
        </header>

        <section className="mt-6 grid grid-cols-2 gap-8">
          <div>
            <div className="text-xs uppercase text-slate-500">Supplier · المورد</div>
            <div className="mt-1 text-base font-semibold">{order.supplier.name}</div>
            {order.supplier.country && <div className="text-slate-600">{order.supplier.country}</div>}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 self-start text-right">
            <dt className="text-slate-500">Order no. · رقم الأمر</dt>
            <dd className="font-semibold">{order.number}</dd>
            <dt className="text-slate-500">Date · التاريخ</dt>
            <dd>{formatDate(order.date)}</dd>
            {order.expectedDate && (
              <>
                <dt className="text-slate-500">Expected by · موعد الوصول المتوقع</dt>
                <dd>{formatDate(order.expectedDate)}</dd>
              </>
            )}
            <dt className="text-slate-500">Currency · العملة</dt>
            <dd>{order.currency}</dd>
          </dl>
        </section>

        <table className="mt-8 w-full">
          <thead>
            <tr className="border-b border-slate-300 text-left text-xs text-slate-500 [&>th]:pb-2">
              <th>Code · الكود</th>
              <th>Product · الصنف</th>
              <th className="text-right">Qty · الكمية</th>
              <th className="text-right">Price · السعر</th>
              <th className="text-right">Amount · القيمة</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((l) => (
              <tr key={l.id} className="border-b border-slate-100 [&>td]:py-2.5">
                <td className="font-mono text-xs">{l.item.code}</td>
                <td>
                  <div className="font-medium">{l.item.name}</div>
                  {l.item.casNumber && <div className="text-xs text-slate-500">CAS {l.item.casNumber}</div>}
                </td>
                <td className="num">{qty(l.qty)} {l.item.unit}</td>
                <td className="num">{money(l.unitPrice, 2)}</td>
                <td className="num">{money(new Decimal(l.qty.toString()).times(l.unitPrice.toString()))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 ml-auto w-72 space-y-1">
          <div className="flex justify-between border-t-2 border-slate-900 pt-2 text-base font-bold"><span>Total {order.currency} · الإجمالي</span><span className="num">{money(total)}</span></div>
        </div>

        {order.notes && <p className="mt-10 whitespace-pre-line text-slate-600">{order.notes}</p>}
      </article>
    </div>
  );
}
