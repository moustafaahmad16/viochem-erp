import { ActionForm, Field, Select, Submit } from "@/components/forms";
import { ButtonLink, Card, PageHeader } from "@/components/ui";
import { toInputDate, today } from "@/lib/dates";
import { db } from "@/lib/db";
import { getT } from "@/i18n/server";
import { createInvoice } from "../actions";

export async function generateMetadata() {
  return { title: (await getT())("New invoice") };
}

export default async function NewInvoicePage({ searchParams }: PageProps<"/invoices/new">) {
  const t = await getT();
  const selected = String((await searchParams).customer ?? "");
  const customers = await db.customer.findMany({ orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader title={t("New invoice")} back={{ href: "/invoices", label: t("Invoices") }} />
      <Card className="max-w-xl">
        {customers.length === 0 ? (
          <div className="space-y-3 text-sm text-slate-600">
            <p>{t("Add a customer first.")}</p>
            <ButtonLink href="/customers">{t("Add a customer")}</ButtonLink>
          </div>
        ) : (
          <ActionForm action={createInvoice}>
            <Select label={t("Customer")} name="customerId" defaultValue={selected} options={customers.map((c) => ({ value: c.id, label: c.name }))} placeholder={t("Choose…")} required />
            <Field label={t("Invoice date")} name="date" type="date" defaultValue={toInputDate(today())} required />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("Invoice number")} name="number" dir="ltr" hint={t("Leave empty for the next number")} />
              <Field label={t("Delivery note no.")} name="deliveryNoteNo" dir="ltr" />
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="wht" /> {t("Customer deducts 1% withholding tax (WHT, خصم الضريبة)")}</label>
            <Submit>{t("Continue")}</Submit>
          </ActionForm>
        )}
      </Card>
    </>
  );
}
