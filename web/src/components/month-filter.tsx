"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/i18n/client";

/** Picks a month for a list; the choice goes in the address (?month=2026-10) next to any other filter. */
export function MonthFilter({ months }: { months: { key: string; label: string }[] }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const month = params.get("month") ?? "";
  return (
    <select
      aria-label={t("Month")}
      value={month}
      onChange={(e) => {
        const next = new URLSearchParams(params);
        if (e.target.value) next.set("month", e.target.value);
        else next.delete("month");
        const q = next.toString();
        router.push(q ? `${pathname}?${q}` : pathname);
      }}
      className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700"
    >
      <option value="">{t("All months")}</option>
      {months.map((m) => (
        <option key={m.key} value={m.key}>{m.label}</option>
      ))}
      {month && !months.some((m) => m.key === month) && <option value={month}>{month}</option>}
    </select>
  );
}

