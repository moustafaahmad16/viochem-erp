import type { RfqStatus } from "@prisma/client";
import { ButtonLink, Card, PageHeader, RowLink, Table } from "@/components/ui";
import { db } from "@/lib/db";
import { getT } from "@/i18n/server";
import { RfqStatusBadge } from "./status";

export async function generateMetadata() {
  return { title: (await getT())("Requests for quotation") };
}

const FILTERS = [
  { key: "", label: "Open" },
  { key: "ORDERED", label: "Ordered" },
  { key: "CANCELLED", label: "Cancelled" },
  { key: "all", label: "All" },
] as const;

export default async function RfqsPage({ searchParams }: PageProps<"/rfqs">) {
  const t = await getT();
  const status = String((await searchParams).status ?? "");
  const where = status === "all" ? {} : { status: (status === "ORDERED" || status === "CANCELLED" ? status : "OPEN") as RfqStatus };
  const rfqs = await db.rfq.findMany({
    where,
    include: { lines: { include: { item: true } }, suppliers: true },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: 200,
  });

  return (
    <>
      <PageHeader
        title={t("Requests for quotation")}
        subtitle={t("Ask several suppliers for prices on one Excel sheet, load their replies, and see who to buy each product from.")}
        actions={
          <>
            <ButtonLink href="/rfqs/new?from=low-stock" variant="secondary">{t("Start from low stock")}</ButtonLink>
            <ButtonLink href="/rfqs/new">{t("New request")}</ButtonLink>
          </>
        }
      />
      <div className="mb-3 flex gap-1">
        {FILTERS.map((f) => (
          <a key={f.key} href={f.key ? `/rfqs?status=${f.key}` : "/rfqs"} className={`rounded-full px-3 py-1 text-sm ${status === f.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-200"}`}>
            {t(f.label)}
          </a>
        ))}
      </div>
      <Card padded={false}>
        <Table
          head={<tr><th>{t("Request")}</th><th>{t("Products")}</th><th>{t("Date")}</th><th>{t("Reply by")}</th><th>{t("Needed by")}</th><th className="num">{t("Replies")}</th><th>{t("Status")}</th></tr>}
          empty={t("No requests here.")}
        >
          {rfqs.map((r) => {
            const names = r.lines.map((l) => l.item.name);
            return (
              <tr key={r.id} className="hover:bg-slate-50">
                <td><RowLink href={`/rfqs/${r.id}`}>{r.number}</RowLink></td>
                <td className="max-w-xs truncate">{names.slice(0, 3).join(", ")}{names.length > 3 && ` +${names.length - 3}`}</td>
                <td>{t.date(r.date)}</td>
                <td>{t.date(r.replyBy)}</td>
                <td>{t.date(r.neededBy)}</td>
                <td className="num">{r.suppliers.filter((s) => s.repliedAt).length} / {r.suppliers.length}</td>
                <td><RfqStatusBadge status={r.status} /></td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}
