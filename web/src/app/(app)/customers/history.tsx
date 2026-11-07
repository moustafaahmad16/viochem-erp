import { Card, RowLink, Table } from "@/components/ui";
import { TabPills } from "@/components/tabs";
import { invoiceTotals } from "@/lib/costing";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { creditTotals } from "@/lib/services/credits";
import type { getT } from "@/i18n/server";
import { ChequeStatusBadge } from "../cheques/status";
import { InvoiceNumber, InvoiceStatusBadge } from "../invoices/status";
import { QuoteStatusBadge } from "../quotes/status";

type T = Awaited<ReturnType<typeof getT>>;

/** Everything done with one customer, a tab per kind of document. */
export async function CustomerHistory({ customerId, tab, t }: { customerId: number; tab: string; t: T }) {
  const where = { customerId };
  const [invoices, quotes, credits, cheques] = await Promise.all([
    db.invoice.findMany({ where, include: { lines: true }, orderBy: [{ date: "desc" }, { id: "desc" }] }),
    db.quote.findMany({ where, include: { lines: true, invoice: true }, orderBy: [{ date: "desc" }, { id: "desc" }] }),
    db.creditNote.findMany({ where, include: { lines: true, invoice: true }, orderBy: [{ date: "desc" }, { id: "desc" }] }),
    db.cheque.findMany({ where, orderBy: [{ dueDate: "desc" }, { id: "desc" }] }),
  ]);
  const tabs = [
    { key: "", label: t("Invoices"), count: invoices.length },
    { key: "quotes", label: t("Quotations"), count: quotes.length },
    { key: "credits", label: t("Credit notes"), count: credits.length },
    { key: "cheques", label: t("Cheques"), count: cheques.length },
  ];
  const current = tabs.some((x) => x.key === tab) ? tab : "";

  return (
    <Card title={<span id="history">{t("History")}</span>} padded={false}>
      <div className="border-b border-slate-100 px-5 py-3">
        <TabPills tabs={tabs} current={current} href={(k) => `/customers/${customerId}${k ? `?tab=${k}` : ""}#history`} />
      </div>
      {current === "quotes" ? (
        <Table head={<tr><th>{t("Quotation")}</th><th>{t("Date")}</th><th>{t("Status")}</th><th>{t("Invoice")}</th><th className="num">{t("Total (EGP)")}</th></tr>} empty={t("No quotations for this customer yet.")}>
          {quotes.map((q) => (
            <tr key={q.id}>
              <td><RowLink href={`/quotes/${q.id}`}>{q.number}</RowLink></td>
              <td>{t.date(q.date)}</td>
              <td><QuoteStatusBadge status={q.status} validUntil={q.validUntil} /></td>
              <td>{q.invoice && <RowLink href={`/invoices/${q.invoice.id}`}><InvoiceNumber number={q.invoice.number} /></RowLink>}</td>
              <td className="num">{money(invoiceTotals(q.lines, q.vatRate.toString()).total)}</td>
            </tr>
          ))}
        </Table>
      ) : current === "credits" ? (
        <Table head={<tr><th>{t("Credit note")}</th><th>{t("Invoice")}</th><th>{t("Date")}</th><th>{t("Status")}</th><th className="num">{t("Total (EGP)")}</th></tr>} empty={t("No credit notes for this customer.")}>
          {credits.map((n) => (
            <tr key={n.id}>
              <td><RowLink href={`/credit-notes/${n.id}`}>{n.number}</RowLink></td>
              <td><RowLink href={`/invoices/${n.invoiceId}`}><InvoiceNumber number={n.invoice.number} /></RowLink></td>
              <td>{t.date(n.date)}</td>
              <td><InvoiceStatusBadge status={n.status} /></td>
              <td className="num">{money(creditTotals(n).total)}</td>
            </tr>
          ))}
        </Table>
      ) : current === "cheques" ? (
        <Table head={<tr><th>{t("Cheque")}</th><th>{t("Cheque no.")}</th><th>{t("Bank")}</th><th>{t("Due")}</th><th>{t("Status")}</th><th className="num">{t("Amount (EGP)")}</th></tr>} empty={t("No cheques from this customer.")}>
          {cheques.map((c) => (
            <tr key={c.id}>
              <td><RowLink href={`/cheques/${c.id}`}>{c.number}</RowLink></td>
              <td className="font-mono">{c.chequeNo}</td>
              <td>{c.bank}</td>
              <td>{t.date(c.dueDate)}</td>
              <td><ChequeStatusBadge status={c.status} direction={c.direction} /></td>
              <td className="num">{money(c.amount)}</td>
            </tr>
          ))}
        </Table>
      ) : (
        <Table head={<tr><th>{t("Invoice")}</th><th>{t("Date")}</th><th>{t("Status")}</th><th className="num">{t("Total (EGP)")}</th></tr>} empty={t("No invoices for this customer yet.")}>
          {invoices.map((i) => (
            <tr key={i.id}>
              <td><RowLink href={`/invoices/${i.id}`}><InvoiceNumber number={i.number} /></RowLink></td>
              <td>{t.date(i.date)}</td>
              <td><InvoiceStatusBadge status={i.status} /></td>
              <td className="num">{money(invoiceTotals(i.lines, i.vatRate.toString()).total)}</td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}
