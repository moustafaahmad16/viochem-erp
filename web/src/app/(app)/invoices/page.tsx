import { ButtonLink, Card, PageHeader, RowLink, Table } from "@/components/ui";
import { invoiceTotals } from "@/lib/costing";
import { db } from "@/lib/db";
import { MonthFilter } from "@/components/month-filter";
import { monthRange, monthsSince } from "@/lib/dates";
import { listHref, money } from "@/lib/format";
import { getT } from "@/i18n/server";
import { EtaBadge, InvoiceStatusBadge } from "./status";

export async function generateMetadata() {
  return { title: (await getT())("Invoices") };
}

const FILTERS = [
  { key: "", label: "All" },
  { key: "DRAFT", label: "Drafts" },
  { key: "POSTED", label: "Posted" },
  { key: "CANCELLED", label: "Cancelled" },
] as const;

export default async function InvoicesPage({ searchParams }: PageProps<"/invoices">) {
  const t = await getT();
  const params = await searchParams;
  const status = String(params.status ?? "");
  const month = String(params.month ?? "");
  const range = monthRange(month);
  const first = await db.invoice.aggregate({ _min: { date: true } });
  const invoices = await db.invoice.findMany({
    where: { ...(status ? { status: status as "DRAFT" | "POSTED" | "CANCELLED" } : {}), ...(range ? { date: range } : {}) },
    include: { customer: true, lines: true },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: 200,
  });

  return (
    <>
      <PageHeader title={t("Sales invoices")} actions={<ButtonLink href="/invoices/new">{t("New invoice")}</ButtonLink>} />
      <div className="mb-3 flex flex-wrap items-center gap-1">
        {FILTERS.map((f) => (
          <a
            key={f.key}
            href={listHref("/invoices", { status: f.key, month: range ? month : undefined })}
            className={`rounded-full px-3 py-1 text-sm ${status === f.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-200"}`}
          >
            {t(f.label)}
          </a>
        ))}
        <div className="ms-auto"><MonthFilter months={monthsSince(first._min.date)} /></div>
      </div>
      <Card padded={false}>
        <Table
          head={<tr><th>{t("Invoice")}</th><th>{t("Customer")}</th><th>{t("Date")}</th><th>{t("Delivery note no.")}</th><th>{t("Status")}</th><th>{t("E-invoice")}</th><th className="num">{t("Total (EGP)")}</th></tr>}
          empty={t("No invoices here.")}
        >
          {invoices.map((i) => (
            <tr key={i.id} className="hover:bg-slate-50">
              <td><RowLink href={`/invoices/${i.id}`}>{i.number}</RowLink></td>
              <td>{i.customer.name}</td>
              <td>{t.date(i.date)}</td>
              <td>{i.deliveryNoteNo}</td>
              <td><InvoiceStatusBadge status={i.status} /></td>
              <td>{i.status !== "DRAFT" && <EtaBadge status={i.etaStatus} />}</td>
              <td className="num">{money(invoiceTotals(i.lines, i.vatRate.toString()).total)}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
