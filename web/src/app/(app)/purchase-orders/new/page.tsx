import { ActionForm, Field, Select, Submit, TextArea } from "@/components/forms";
import { ButtonLink, Card, PageHeader } from "@/components/ui";
import { toInputDate, today } from "@/lib/dates";
import { db } from "@/lib/db";
import { getT } from "@/i18n/server";
import { CURRENCIES } from "../../suppliers/fields";
import { createOrder } from "../actions";

export async function generateMetadata() {
  return { title: (await getT())("New purchase order") };
}

export default async function NewPurchaseOrderPage({ searchParams }: PageProps<"/purchase-orders/new">) {
  const t = await getT();
  const selected = String((await searchParams).supplier ?? "");
  const suppliers = await db.supplier.findMany({ orderBy: { name: "asc" } });
  const back = { href: "/purchase-orders", label: t("Purchase orders") };
  if (!suppliers.length) {
    return (
      <>
        <PageHeader title={t("New purchase order")} back={back} />
        <Card className="max-w-xl">
          <p className="mb-4 text-sm text-slate-600">{t("Add a supplier first, then come back to create the order.")}</p>
          <ButtonLink href="/suppliers">{t("Add a supplier")}</ButtonLink>
        </Card>
      </>
    );
  }
  return (
    <>
      <PageHeader title={t("New purchase order")} subtitle={t("You'll add the products on the next screen.")} back={back} />
      <Card className="max-w-xl">
        <ActionForm action={createOrder}>
          <Select label={t("Supplier")} name="supplierId" defaultValue={selected} options={suppliers.map((s) => ({ value: s.id, label: s.name }))} placeholder={t("Choose…")} required />
          <Select
            label={t("Currency")}
            name="currency"
            options={CURRENCIES}
            placeholder={t("The supplier's currency")}
            hint={t("Leave as is to use the supplier's currency.")}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("Order date")} name="date" type="date" defaultValue={toInputDate(today())} required />
            <Field label={t("Expected by")} name="expectedDate" type="date" />
          </div>
          <TextArea label={t("Notes (printed on the order)")} name="notes" />
          <Submit>{t("Continue")}</Submit>
        </ActionForm>
      </Card>
    </>
  );
}
