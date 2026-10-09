import { ButtonLink, Card, PageHeader, RowLink, Table } from "@/components/ui";
import { invoiceTotals } from "@/lib/costing";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { getT } from "@/i18n/server";
import { QuoteStatusBadge } from "./status";

export async function generateMetadata() {
  return { title: (await getT())("Quotations") };
}

const FILTERS = [
  { key: "", label: "All" },
  { key: "OPEN", label: "Open" },
  { key: "ACCEPTED", label: "Accepted" },
  { key: "DECLINED", label: "Declined" },
] as const;

export default async function QuotesPage({ searchParams }: PageProps<"/quotes">) {
  const t = await getT();
  const raw = String((await searchParams).status ?? "");
  const status = FILTERS.some((f) => f.key === raw) ? raw : "";
  const quotes = await db.quote.findMany({
    where: status ? { status: status as "OPEN" | "ACCEPTED" | "DECLINED" } : {},
    include: { customer: true, lines: true },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: 200,
  });

  return (
    <>
      <PageHeader title={t("Quotations")} actions={<ButtonLink href="/quotes/new">{t("New quotation")}</ButtonLink>} />
      <div className="mb-3 flex gap-1">
        {FILTERS.map((f) => (
          <a
            key={f.key}
            href={f.key ? `/quotes?status=${f.key}` : "/quotes"}
            className={`rounded-full px-3 py-1 text-sm ${status === f.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-200"}`}
          >
            {t(f.label)}
          </a>
        ))}
      </div>
      <Card padded={false}>
        <Table
          head={<tr><th>{t("Quotation")}</th><th>{t("Customer")}</th><th>{t("Date")}</th><th>{t("Valid until")}</th><th>{t("Status")}</th><th className="num">{t("Total (EGP)")}</th></tr>}
          empty={t("No quotations here.")}
        >
          {quotes.map((q) => (
            <tr key={q.id} className="hover:bg-slate-50">
              <td><RowLink href={`/quotes/${q.id}`}>{q.number}</RowLink></td>
              <td>{q.customer.name}</td>
              <td>{t.date(q.date)}</td>
              <td>{q.validUntil ? t.date(q.validUntil) : ""}</td>
              <td><QuoteStatusBadge status={q.status} validUntil={q.validUntil} /></td>
              <td className="num">{money(invoiceTotals(q.lines, q.vatRate.toString()).total)}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
