import { ActionForm, Field, Submit, TextArea } from "@/components/forms";
import { Card, RowLink } from "@/components/ui";
import { toInputDate, today } from "@/lib/dates";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { creditTotals } from "@/lib/services/credits";
import { getT } from "@/i18n/server";
import { InvoiceStatusBadge } from "../invoices/status";
import { createCreditNote } from "./actions";

/** On a posted invoice: its credit notes, and a form to start a new one. */
export async function InvoiceCreditNotes({ invoice }: { invoice: { id: number; date: Date; status: string } }) {
  const t = await getT();
  const notes = await db.creditNote.findMany({ where: { invoiceId: invoice.id }, include: { lines: true }, orderBy: [{ date: "asc" }, { id: "asc" }] });
  if (invoice.status !== "POSTED" && !notes.length) return null;
  const day = today() < invoice.date ? invoice.date : today();

  return (
    <Card title={t("Credit note or return")}>
      {notes.length > 0 && (
        <ul className="mb-4 space-y-2 text-sm">
          {notes.map((n) => (
            <li key={n.id} className="flex items-center justify-between gap-2">
              <span>
                <RowLink href={`/credit-notes/${n.id}`}>{n.number}</RowLink> <span className="text-slate-500">· {t.date(n.date)}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="num">{money(creditTotals(n).total)}</span>
                <InvoiceStatusBadge status={n.status} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {invoice.status === "POSTED" && (
        <ActionForm action={createCreditNote.bind(null, invoice.id)}>
          <p className="text-sm text-slate-600">{t("For goods sent back or a lower price agreed after the invoice. You choose the products next.")}</p>
          <Field label={t("Date")} name="date" type="date" defaultValue={toInputDate(day)} required />
          <TextArea label={t("Reason")} name="reason" placeholder={t("e.g. 2 drums damaged in delivery")} required />
          <Submit variant="secondary">{t("Start a credit note")}</Submit>
        </ActionForm>
      )}
    </Card>
  );
}
