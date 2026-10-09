import { notFound } from "next/navigation";
import { getT } from "@/i18n/server";
import { requireUser } from "@/lib/auth";
import { buildReport } from "@/lib/reports/definitions";
import { display, isNumeric } from "@/lib/reports/table";
import { PrintButton } from "../../invoices/[id]/print-button";
import { AutoPrint } from "./auto-print";

export async function generateMetadata({ params }: PageProps<"/print/reports/[report]">) {
  const t = await getT();
  const title = REPORT_TITLES[(await params).report];
  return { title: title ? t(title) : "VIOCHEM" };
}

const REPORT_TITLES: Record<string, string> = {
  dashboard: "Daily budget",
  products: "Products by movement",
  "low-stock": "Low stock",
  customers: "Customers ranked",
  suppliers: "Suppliers ranked",
  receivables: "Owed to you",
  payables: "You owe",
  accounts: "Bank & cash",
  margin: "Margins",
  profit: "Profit and loss",
  expiry: "Expiring lots",
  "product-moves": "Movements",
};

/** A report laid out for A4, to print or save as PDF. Wide reports turn the page sideways. */
export default async function PrintReportPage({ params, searchParams }: PageProps<"/print/reports/[report]">) {
  await requireUser();
  const t = await getT();
  const sp = await searchParams;
  const q = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
  const report = await buildReport((await params).report, q, t).catch(() => null);
  if (!report) notFound();
  const wide = report.sections.some((s) => s.columns.length > 7);

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <style>{`@page { size: A4 ${wide ? "landscape" : "portrait"}; margin: 12mm; }`}</style>
      <AutoPrint />
      <div className={`mx-auto mb-4 flex justify-end print:hidden ${wide ? "max-w-[297mm]" : "max-w-[210mm]"}`}>
        <PrintButton />
      </div>
      <article dir={t.dir} className={`mx-auto bg-white p-10 text-[12px] text-slate-900 shadow print:p-0 print:shadow-none ${wide ? "max-w-[297mm]" : "max-w-[210mm]"}`}>
        <header className="flex items-start justify-between gap-6 border-b-2 border-brand-600 pb-4">
          <div>
            <h1 className="text-xl font-semibold">{report.title}</h1>
            {report.subtitle && <div className="mt-1 text-slate-500">{report.subtitle}</div>}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="VIOCHEM" className="h-12 w-auto" />
        </header>
        {report.sections.map((s, i) => (
          <section key={i} className="mt-6 break-inside-avoid-page">
            {s.title && <h2 className="mb-2 text-sm font-semibold text-brand-900">{s.title}</h2>}
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-300 text-[11px] text-slate-500">
                  {s.columns.map((c, j) => (
                    <th key={j} className={`px-1.5 pb-1.5 align-bottom font-medium ${isNumeric(c.kind) ? "text-end" : "text-start"}`}>{c.title}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.rows.map((r, j) => (
                  <tr key={j} className="border-b border-slate-100 break-inside-avoid">
                    {r.map((v, k) => (
                      <td key={k} className={`px-1.5 py-1 ${isNumeric(s.columns[k]?.kind) ? "text-end tabular-nums" : ""}`} dir={isNumeric(s.columns[k]?.kind) ? "ltr" : undefined}>
                        {display(t, v, s.columns[k]?.kind)}
                      </td>
                    ))}
                  </tr>
                ))}
                {s.rows.length === 0 && (
                  <tr><td colSpan={s.columns.length} className="py-3 text-center text-slate-500">{t("Nothing to show.")}</td></tr>
                )}
              </tbody>
              {s.total && (
                <tfoot>
                  <tr className="border-t-2 border-slate-300 font-semibold">
                    {s.total.map((v, k) => (
                      <td key={k} className={`px-1.5 py-1.5 ${isNumeric(s.columns[k]?.kind) ? "text-end tabular-nums" : ""}`} dir={isNumeric(s.columns[k]?.kind) ? "ltr" : undefined}>
                        {display(t, v, s.columns[k]?.kind)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
            {s.note && <p className="mt-1.5 text-[11px] text-slate-500">{s.note}</p>}
          </section>
        ))}
      </article>
    </div>
  );
}
