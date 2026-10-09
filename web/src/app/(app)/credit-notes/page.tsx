import { Card, PageHeader, RowLink, Table } from "@/components/ui";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { creditTotals } from "@/lib/services/credits";
import { getT } from "@/i18n/server";
import { EtaBadge, InvoiceStatusBadge } from "../invoices/status";

export async function generateMetadata() {
  return { title: (await getT())("Credit notes") };
}

const FILTERS = [
  { key: "", label: "All" },
  { key: "DRAFT", label: "Drafts" },
  { key: "POSTED", label: "Posted" },
  { key: "CANCELLED", label: "Cancelled" },
] as const;

export default async function CreditNotesPage({ searchParams }: PageProps<"/credit-notes">) {
  const t = await getT();
  const status = String((await searchParams).status ?? "");
  const notes = await db.creditNote.findMany({
    where: status ? { status: status as "DRAFT" | "POSTED" | "CANCELLED" } : {},
    include: { customer: true, invoice: true, lines: true },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: 200,
  });

  return (
    <>
      <PageHeader title={t("Credit notes")} subtitle={t("Goods returned and prices reduced after an invoice. Start one from the invoice.")} />
      <div className="mb-3 flex gap-1">
        {FILTERS.map((f) => (
          <a
            key={f.key}
            href={f.key ? `/credit-notes?status=${f.key}` : "/credit-notes"}
            className={`rounded-full px-3 py-1 text-sm ${status === f.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-200"}`}
          >
            {t(f.label)}
          </a>
        ))}
      </div>
      <Card padded={false}>
        <Table
          head={<tr><th>{t("Credit note")}</th><th>{t("Invoice")}</th><th>{t("Customer")}</th><th>{t("Date")}</th><th>{t("Status")}</th><th>{t("E-invoice")}</th><th className="num">{t("Total (EGP)")}</th></tr>}
          empty={t("No credit notes here.")}
        >
          {notes.map((n) => (
            <tr key={n.id} className="hover:bg-slate-50">
              <td><RowLink href={`/credit-notes/${n.id}`}>{n.number}</RowLink></td>
              <td><RowLink href={`/invoices/${n.invoiceId}`}>{n.invoice.number}</RowLink></td>
              <td>{n.customer.name}</td>
              <td>{t.date(n.date)}</td>
              <td><InvoiceStatusBadge status={n.status} /></td>
              <td>{n.status !== "DRAFT" && <EtaBadge status={n.etaStatus} />}</td>
              <td className="num">{money(creditTotals(n).total)}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
