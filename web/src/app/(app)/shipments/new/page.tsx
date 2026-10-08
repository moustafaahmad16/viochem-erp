import { ActionForm, Field, Select, Submit, TextArea } from "@/components/forms";
import { ButtonLink, Card, PageHeader } from "@/components/ui";
import { toInputDate, today } from "@/lib/dates";
import { db } from "@/lib/db";
import { CURRENCIES } from "../../suppliers/fields";
import { createShipment } from "../actions";

export const metadata = { title: "New shipment" };

export default async function NewShipmentPage() {
  const suppliers = await db.supplier.findMany({ orderBy: { name: "asc" } });
  if (!suppliers.length) {
    return (
      <>
        <PageHeader title="New shipment" back={{ href: "/shipments", label: "Shipments" }} />
        <Card>
          <p className="mb-4 text-sm text-slate-600">Add a supplier first, then come back to create the shipment.</p>
          <ButtonLink href="/suppliers">Add a supplier</ButtonLink>
        </Card>
      </>
    );
  }
  return (
    <>
      <PageHeader title="New shipment" subtitle="You'll add the products and charges on the next screen." back={{ href: "/shipments", label: "Shipments" }} />
      <Card>
        <ActionForm action={createShipment} className="grid gap-4 sm:grid-cols-2">
          <Select label="Supplier" name="supplierId" options={suppliers.map((s) => ({ value: s.id, label: s.name }))} required />
          <Field label="Supplier invoice no." name="supplierInvoiceNo" />
          <Select label="Currency" name="currency" options={CURRENCIES} defaultValue={suppliers[0].currency} />
          <Field label="Exchange rate to EGP" name="fxRate" inputMode="decimal" required placeholder="e.g. 48.50" hint="The rate you paid the supplier at. You can change it until the goods arrive." />
          <Field label="Order date" name="orderDate" type="date" defaultValue={toInputDate(today())} required />
          <div />
          <Field label="Departure date (ETD)" name="etd" type="date" />
          <Field label="Expected arrival (ETA)" name="eta" type="date" />
          <Select
            label="Spread charges by"
            name="allocation"
            options={[{ value: "VALUE", label: "Value of each product" }, { value: "QUANTITY", label: "Quantity (kg) of each product" }]}
            hint="How freight, duty and other costs are shared between products"
          />
          <TextArea label="Notes" name="notes" className="sm:col-span-2" />
          <div className="sm:col-span-2">
            <Submit>Create shipment</Submit>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
