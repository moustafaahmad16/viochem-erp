import { ActionForm, Field, Select, Submit, TextArea } from "@/components/forms";
import { ButtonLink, Card, PageHeader } from "@/components/ui";
import { toInputDate, today } from "@/lib/dates";
import { db } from "@/lib/db";
import { getT } from "@/i18n/server";
import { createRequest } from "../actions";
import { RequestRows } from "../request-rows";
import { requestItems } from "../items";

export async function generateMetadata() {
  return { title: (await getT())("New customer request") };
}

export default async function NewRequestPage({ searchParams }: PageProps<"/requests/new">) {
  const t = await getT();
  const selected = String((await searchParams).customer ?? "");
  const [customers, items] = await Promise.all([db.customer.findMany({ orderBy: { name: "asc" } }), requestItems()]);
  return (
    <>
      <PageHeader
        title={t("New customer request")}
        subtitle={t("List everything the customer asked for, even products that are out of stock or not found in our list.")}
        back={{ href: "/requests", label: t("Customer requests") }}
      />
      {customers.length === 0 ? (
        <Card className="max-w-xl">
          <div className="space-y-3 text-sm text-slate-600">
            <p>{t("Add a customer first.")}</p>
            <ButtonLink href="/customers">{t("Add a customer")}</ButtonLink>
          </div>
        </Card>
      ) : (
        <ActionForm action={createRequest} className="max-w-4xl space-y-4">
          <div className="grid max-w-xl gap-3 sm:grid-cols-2">
            <Select label={t("Customer")} name="customerId" defaultValue={selected} options={customers.map((c) => ({ value: c.id, label: c.name }))} placeholder={t("Choose…")} required />
            <Field label={t("Date")} name="date" type="date" defaultValue={toInputDate(today())} required />
          </div>
          <Card padded={false}>
            <RequestRows items={items} />
          </Card>
          <TextArea label={t("Notes")} name="notes" className="max-w-xl" hint={t("Copied onto the quotation.")} />
          <Submit>{t("Save request")}</Submit>
        </ActionForm>
      )}
    </>
  );
}
