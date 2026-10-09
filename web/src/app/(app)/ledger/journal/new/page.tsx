import { ActionForm, Field, Submit } from "@/components/forms";
import { Card, PageHeader } from "@/components/ui";
import { getT } from "@/i18n/server";
import { requireAdmin } from "@/lib/auth";
import { toInputDate, today } from "@/lib/dates";
import { journalAccountOptions } from "@/lib/services/journal";
import { addJournal } from "../../actions";
import { codedName } from "../../parts";
import { JournalLines } from "./lines";

export async function generateMetadata() {
  return { title: (await getT())("New journal entry") };
}

export default async function NewJournalPage() {
  await requireAdmin();
  const [options, t] = await Promise.all([journalAccountOptions(), getT()]);
  const accounts = options.map((o) => ({ ...o, label: o.value.startsWith("L") ? codedName(t, o.label) : o.label, group: t(o.group) }));
  return (
    <>
      <PageHeader title={t("New journal entry")} subtitle={t("For what no document records, like capital, loans, depreciation or paying VAT to the tax authority.")} back={{ href: "/ledger/journal", label: t("Journal") }} />
      <Card>
        <ActionForm action={addJournal}>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label={t("Date")} name="date" type="date" defaultValue={toInputDate(today())} required />
            <Field label={t("What it is for")} name="memo" required className="sm:col-span-3" placeholder={t("Depreciation for September")} />
          </div>
          <JournalLines accounts={accounts} />
          <p className="text-xs text-slate-500">
            {t("Customers, suppliers, stock and goods in transit aren't listed: invoices, shipments and payments keep them. Bank lines are in EGP.")}
          </p>
          <Submit>{t("Save entry")}</Submit>
        </ActionForm>
      </Card>
    </>
  );
}
