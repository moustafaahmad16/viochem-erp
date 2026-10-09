import { ButtonLink, Card, PageHeader, RowLink, Table } from "@/components/ui";
import { invoiceTotals } from "@/lib/costing";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
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
  const status = String((await searchParams).status ?? "");
  const invoices = await db.invoice.findMany({
    where: status ? { status: status as "DRAFT" | "POSTED" | "CANCELLED" } : {},
    include: { customer: true, lines: true },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: 200,
  });

  return (
    <>
      <PageHeader title={t("Sales invoices")} actions={<ButtonLink href="/invoices/new">{t("New invoice")}</ButtonLink>} />
      <div className="mb-3 flex gap-1">
        {FILTERS.map((f) => (
          <a
            key={f.key}
            href={f.key ? `/invoices?status=${f.key}` : "/invoices"}
            className={`rounded-full px-3 py-1 text-sm ${status === f.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-200"}`}
          >
            {t(f.label)}
          </a>
        ))}
      </div>
      <Card padded={false}>
        <Table
          head={<tr><th>{t("Invoice")}</th><th>{t("Customer")}</th><th>{t("Date")}</th><th>{t("Status")}</th><th>{t("E-invoice")}</th><th className="num">{t("Total (EGP)")}</th></tr>}
          empty={t("No invoices here.")}
        >
          {invoices.map((i) => (
            <tr key={i.id} className="hover:bg-slate-50">
              <td><RowLink href={`/invoices/${i.id}`}>{i.number}</RowLink></td>
              <td>{i.customer.name}</td>
              <td>{t.date(i.date)}</td>
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
