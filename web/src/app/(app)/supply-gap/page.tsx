import Link from "next/link";
import { ButtonLink, Card, PageHeader, RowLink, Table } from "@/components/ui";
import { qty } from "@/lib/format";
import { today } from "@/lib/dates";
import { stillToBuy, supplyGap } from "@/lib/services/requests";
import { getT } from "@/i18n/server";
import { setHandled } from "../requests/actions";

export async function generateMetadata() {
  return { title: (await getT())("Supply gap") };
}

const PERIODS = [
  { key: "3", label: "Last 3 months" },
  { key: "6", label: "Last 6 months" },
  { key: "12", label: "Last 12 months" },
  { key: "all", label: "All time" },
] as const;

const monthsBack = (n: number) => {
  const d = today();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, d.getUTCDate()));
};

export default async function SupplyGapPage({ searchParams }: PageProps<"/supply-gap">) {
  const t = await getT();
  const sp = await searchParams;
  const tab = sp.tab === "local" ? "local" : "ours";
  const period = PERIODS.find((p) => p.key === sp.period)?.key ?? "12";
  const handled = sp.show === "handled";
  const gap = await supplyGap({ since: period === "all" ? null : monthsBack(Number(period)), handled });
  const rows = tab === "ours" ? gap.ours : gap.local;
  const href = (patch: Record<string, string>) => {
    const q = new URLSearchParams({ tab, period, ...(handled ? { show: "handled" } : {}), ...patch });
    if (q.get("show") === "") q.delete("show");
    return `/supply-gap?${q}`;
  };
  const toBuy = gap.ours.filter((r) => stillToBuy(r).gt(0));

  return (
    <>
      <PageHeader
        title={t("Supply gap")}
        subtitle={t("What customers asked for that we couldn't offer, added up from customer requests. Use it to decide what to import or buy locally.")}
        actions={
          <>
            <ButtonLink href="/requests" variant="secondary">{t("Customer requests")}</ButtonLink>
            {tab === "ours" && !handled && toBuy.length > 0 && <ButtonLink href="/rfqs/new?from=gap">{t("Ask suppliers for prices")}</ButtonLink>}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm" role="tablist">
          {[
            { key: "ours", label: t("Our products"), n: gap.ours.length },
            { key: "local", label: t("Not found"), n: gap.local.length },
          ].map((x) => (
            <Link
              key={x.key}
              href={href({ tab: x.key })}
              role="tab"
              aria-selected={tab === x.key}
              className={`rounded-md px-3 py-1.5 ${tab === x.key ? "bg-white font-medium text-brand-700 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
            >
              {x.label} <span className="ms-1 rounded-full bg-slate-200 px-1.5 text-xs text-slate-700">{x.n}</span>
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1 text-sm">
          {PERIODS.map((p) => (
            <Link key={p.key} href={href({ period: p.key })} className={`rounded-full px-3 py-1 ${period === p.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-200"}`}>
              {t(p.label)}
            </Link>
          ))}
          <Link href={href({ show: handled ? "" : "handled" })} className={`rounded-full px-3 py-1 ${handled ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-200"}`}>
            {t("Handled")}
          </Link>
        </div>
      </div>

      <p className="mb-3 text-sm text-slate-600">
        {tab === "ours"
          ? t("Products in our list that were out of stock, or short, when a customer asked.")
          : t("Products customers asked for that aren't in our product list. We buy these from local distributors.")}
      </p>

      <Card padded={false}>
        <Table
          head={
            <tr>
              <th>{t("Product")}</th>
              <th className="num">{t("Missing qty")}</th>
              <th className="num">{t("Requests")}</th>
              <th className="num">{t("Customers")}</th>
              <th>{t("Last asked")}</th>
              {tab === "ours" && <th className="num">{t("Free now")}</th>}
              {tab === "ours" && <th className="num">{t("On order")}</th>}
              {tab === "ours" && <th className="num">{t("Still to buy")}</th>}
              <th />
            </tr>
          }
          empty={handled ? t("Nothing handled in this period.") : t("No missing products in this period.")}
        >
          {rows.map((r) => {
            const unit = t(r.unit);
            const lineIds = r.requests.map((x) => x.lineId);
            return (
              <tr key={r.key} className="align-top">
                <td>
                  {r.itemId ? <RowLink href={`/products/${r.itemId}`}>{r.name}</RowLink> : <span className="font-medium">{r.name}</span>}
                  <div className="text-xs text-slate-500">{[r.code, r.cas && `CAS ${r.cas}`].filter(Boolean).join(" · ")}</div>
                  <details className="mt-1 text-xs">
                    <summary className="cursor-pointer text-brand-700">{t("Who asked ({n})", { n: r.requests.length })}</summary>
                    <ul className="mt-1 space-y-0.5 text-slate-600">
                      {r.requests.map((x) => (
                        <li key={x.lineId} className="whitespace-nowrap">
                          {t.date(x.date)} · <Link href={`/customers/${x.customerId}`} className="hover:underline">{x.customer}</Link> · <Link href={`/requests/${x.requestId}`} className="text-brand-700 hover:underline">{x.number}</Link> · {qty(x.qty)} {unit}
                        </li>
                      ))}
                    </ul>
                  </details>
                </td>
                <td className="num whitespace-nowrap font-medium">{qty(r.qty)} {unit}</td>
                <td className="num">{r.requests.length}</td>
                <td className="num" title={r.customers.join(t.dir === "rtl" ? "، " : ", ")}>{r.customers.length}</td>
                <td className="whitespace-nowrap">{t.date(r.lastAsked)}</td>
                {tab === "ours" && <td className="num whitespace-nowrap">{qty(r.free ?? 0)} {unit}</td>}
                {tab === "ours" && <td className="num whitespace-nowrap">{qty(r.coming ?? 0)} {unit}</td>}
                {tab === "ours" && <td className={`num whitespace-nowrap ${stillToBuy(r).gt(0) ? "font-medium text-red-700" : "text-slate-500"}`}>{qty(stillToBuy(r))} {unit}</td>}
                <td className="text-end">
                  <form action={setHandled.bind(null, lineIds, !handled)}>
                    <button className="whitespace-nowrap text-xs font-medium text-brand-700 hover:underline">{handled ? t("Open again") : t("Mark as handled")}</button>
                  </form>
                </td>
              </tr>
            );
          })}
        </Table>
      </Card>
      {!handled && rows.length > 0 && <p className="mt-3 text-xs text-slate-500">{t("Mark a product as handled once it has been ordered, bought locally, or let go. It moves to Handled.")}</p>}
    </>
  );
}
