import { ActionForm, Field, Submit } from "@/components/forms";
import { Card, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { toInputDate, today } from "@/lib/dates";
import { journalAccountOptions } from "@/lib/services/journal";
import { addJournal } from "../../actions";
import { JournalLines } from "./lines";

export const metadata = { title: "New journal entry" };

export default async function NewJournalPage() {
  await requireAdmin();
  const accounts = await journalAccountOptions();
  return (
    <>
      <PageHeader title="New journal entry" subtitle="For what no document records, like capital, loans, depreciation or paying VAT to the tax authority." back={{ href: "/ledger/journal", label: "Journal" }} />
      <Card>
        <ActionForm action={addJournal}>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Date" name="date" type="date" defaultValue={toInputDate(today())} required />
            <Field label="What it is for" name="memo" required className="sm:col-span-3" placeholder="Depreciation for September" />
          </div>
          <JournalLines accounts={accounts} />
          <p className="text-xs text-slate-500">
            Customers, suppliers, stock and goods in transit aren&apos;t listed: invoices, shipments and payments keep them. Bank lines are in EGP.
          </p>
          <Submit>Save entry</Submit>
        </ActionForm>
      </Card>
    </>
  );
}
