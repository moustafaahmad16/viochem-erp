import { ActionForm, Field, Select, Submit, TextArea } from "@/components/forms";
import { ButtonLink, Card, PageHeader } from "@/components/ui";
import { toInputDate, today } from "@/lib/dates";
import { db } from "@/lib/db";
import { getT } from "@/i18n/server";
import { CURRENCIES } from "../../suppliers/fields";
import { createShipment } from "../actions";

export async function generateMetadata() {
  return { title: (await getT())("New shipment") };
}

export default async function NewShipmentPage() {
  const t = await getT();
  const suppliers = await db.supplier.findMany({ orderBy: { name: "asc" } });
  if (!suppliers.length) {
    return (
      <>
        <PageHeader title={t("New shipment")} back={{ href: "/shipments", label: t("Shipments") }} />
        <Card>
          <p className="mb-4 text-sm text-slate-600">{t("Add a supplier first, then come back to create the shipment.")}</p>
          <ButtonLink href="/suppliers">{t("Add a supplier")}</ButtonLink>
        </Card>
      </>
    );
  }
  return (
    <>
      <PageHeader title={t("New shipment")} subtitle={t("You'll add the products and charges on the next screen.")} back={{ href: "/shipments", label: t("Shipments") }} />
      <Card>
        <ActionForm action={createShipment} className="grid gap-4 sm:grid-cols-2">
          <Select label={t("Supplier")} name="supplierId" options={suppliers.map((s) => ({ value: s.id, label: s.name }))} required />
          <Field label={t("Supplier invoice no.")} name="supplierInvoiceNo" />
          <Select label={t("Currency")} name="currency" options={CURRENCIES} defaultValue={suppliers[0].currency} />
          <Field label={t("Exchange rate to EGP")} name="fxRate" inputMode="decimal" required placeholder={t("e.g. {value}", { value: "48.50" })} hint={t("The rate you paid the supplier at. You can change it until the goods arrive.")} />
          <Field label={t("Order date")} name="orderDate" type="date" defaultValue={toInputDate(today())} required />
          <div />
          <Field label={t("Departure date (ETD)")} name="etd" type="date" />
          <Field label={t("Expected arrival (ETA)")} name="eta" type="date" />
          <Select
            label={t("Spread charges by")}
            name="allocation"
            options={[{ value: "VALUE", label: t("Value of each product") }, { value: "QUANTITY", label: t("Quantity (kg) of each product") }]}
            hint={t("How freight, duty and other costs are shared between products")}
          />
          <TextArea label={t("Notes")} name="notes" className="sm:col-span-2" />
          <div className="sm:col-span-2">
            <Submit>{t("Create shipment")}</Submit>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
