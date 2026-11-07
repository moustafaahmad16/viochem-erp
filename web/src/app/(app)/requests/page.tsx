import { ButtonLink, Card, PageHeader, RowLink, Table } from "@/components/ui";
import { db } from "@/lib/db";
import { getT } from "@/i18n/server";
import type { CustomerRequestStatus } from "@prisma/client";
import { RequestStatusBadge } from "./status";

export async function generateMetadata() {
  return { title: (await getT())("Customer requests") };
}

const FILTERS = [
  { key: "", label: "All" },
  { key: "OPEN", label: "Open" },
  { key: "CONVERTED", label: "Sent on" },
  { key: "CANCELLED", label: "Cancelled" },
] as const;

export default async function RequestsPage({ searchParams }: PageProps<"/requests">) {
  const t = await getT();
  const raw = String((await searchParams).status ?? "");
  const status = FILTERS.some((f) => f.key === raw) ? raw : "";
  const requests = await db.customerRequest.findMany({
    where: status ? { status: status as CustomerRequestStatus } : {},
    include: { customer: true, quote: true, lines: true },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: 200,
  });

  return (
    <>
      <PageHeader
        title={t("Customer requests")}
        subtitle={t("Write down what a customer asks for, then send it on: what is in stock goes onto a quotation, the rest to the supply gap.")}
        actions={
          <>
            <ButtonLink href="/supply-gap" variant="secondary">{t("Supply gap")}</ButtonLink>
            <ButtonLink href="/requests/new">{t("New request")}</ButtonLink>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <a
            key={f.key}
            href={f.key ? `/requests?status=${f.key}` : "/requests"}
            className={`rounded-full px-3 py-1 text-sm ${status === f.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-200"}`}
          >
            {t(f.label)}
          </a>
        ))}
      </div>
      <Card padded={false}>
        <Table
          head={<tr><th>{t("Request")}</th><th>{t("Customer")}</th><th>{t("Date")}</th><th className="num">{t("Products")}</th><th className="num">{t("Not offered")}</th><th>{t("Status")}</th><th>{t("Quotation")}</th></tr>}
          empty={t("No customer requests here.")}
        >
          {requests.map((r) => {
            const missing = r.lines.filter((l) => l.gapQty && Number(l.gapQty.toString()) > 0).length;
            return (
              <tr key={r.id} className="hover:bg-slate-50">
                <td><RowLink href={`/requests/${r.id}`}>{r.number}</RowLink></td>
                <td>{r.customer.name}</td>
                <td>{t.date(r.date)}</td>
                <td className="num">{r.lines.length}</td>
                <td className="num">{r.status === "CONVERTED" ? missing : ""}</td>
                <td><RequestStatusBadge status={r.status} /></td>
                <td>{r.quote && <RowLink href={`/quotes/${r.quote.id}`}>{r.quote.number}</RowLink>}</td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}
