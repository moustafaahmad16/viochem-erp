import { ActionForm, Field, Select, Submit } from "@/components/forms";
import { ButtonLink, Card, PageHeader } from "@/components/ui";
import { addDays, toInputDate, today } from "@/lib/dates";
import { db } from "@/lib/db";
import { DEFAULT_VALID_DAYS } from "@/lib/services/quotes";
import { getT } from "@/i18n/server";
import { createQuote } from "../actions";

export async function generateMetadata() {
  return { title: (await getT())("New quotation") };
}

export default async function NewQuotePage({ searchParams }: PageProps<"/quotes/new">) {
  const t = await getT();
  const selected = String((await searchParams).customer ?? "");
  const customers = await db.customer.findMany({ orderBy: { name: "asc" } });
  const day = today();
  return (
    <>
      <PageHeader title={t("New quotation")} back={{ href: "/quotes", label: t("Quotations") }} />
      <Card className="max-w-xl">
        {customers.length === 0 ? (
          <div className="space-y-3 text-sm text-slate-600">
            <p>{t("Add a customer first.")}</p>
            <ButtonLink href="/customers">{t("Add a customer")}</ButtonLink>
          </div>
        ) : (
          <ActionForm action={createQuote}>
            <Select label={t("Customer")} name="customerId" defaultValue={selected} options={customers.map((c) => ({ value: c.id, label: c.name }))} placeholder={t("Choose…")} required />
            <Field label={t("Quotation date")} name="date" type="date" defaultValue={toInputDate(day)} required />
            <Field
              label={t("Valid until")}
              name="validUntil"
              type="date"
              defaultValue={toInputDate(addDays(day, DEFAULT_VALID_DAYS))}
              hint={t("Left empty, it is valid for {n} days.", { n: DEFAULT_VALID_DAYS })}
            />
            <Submit>{t("Continue")}</Submit>
          </ActionForm>
        )}
      </Card>
    </>
  );
}
