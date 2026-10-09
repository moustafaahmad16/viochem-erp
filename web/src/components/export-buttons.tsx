import { getT } from "@/i18n/server";
import { buttonClass } from "./ui";

type Query = Record<string, string | string[] | undefined>;

/** Download the report on this page as Excel, or open it ready to print or save as PDF. */
export async function ExportButtons({ report, query = {} }: { report: string; query?: Query }) {
  const t = await getT();
  const q = new URLSearchParams(Object.entries(query).flatMap(([k, v]) => (typeof v === "string" && v ? [[k, v]] : []))).toString();
  const suffix = q ? `?${q}` : "";
  return (
    <span className="inline-flex gap-2">
      <a href={`/export/${report}${suffix}`} className={buttonClass("secondary")} download>
        <Icon /> Excel
      </a>
      <a href={`/print/reports/${report}${suffix}`} target="_blank" rel="noopener" className={buttonClass("secondary")} title={t("Print or save as PDF")}>
        <Icon /> PDF
      </a>
    </span>
  );
}

function Icon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M8 2v8m0 0L5 7m3 3 3-3M3 12.5V14h10v-1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
