import { ActionForm, Field, Select, Submit } from "@/components/forms";
import { ButtonLink, Card, PageHeader } from "@/components/ui";
import { toInputDate, today } from "@/lib/dates";
import { db } from "@/lib/db";
import { createInvoice } from "../actions";

export const metadata = { title: "New invoice" };

export default async function NewInvoicePage({ searchParams }: PageProps<"/invoices/new">) {
  const selected = String((await searchParams).customer ?? "");
  const customers = await db.customer.findMany({ orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader title="New invoice" back={{ href: "/invoices", label: "Invoices" }} />
      <Card className="max-w-xl">
        {customers.length === 0 ? (
          <div className="space-y-3 text-sm text-slate-600">
            <p>Add a customer first.</p>
            <ButtonLink href="/customers">Add a customer</ButtonLink>
          </div>
        ) : (
          <ActionForm action={createInvoice}>
            <Select label="Customer" name="customerId" defaultValue={selected} options={customers.map((c) => ({ value: c.id, label: c.name }))} placeholder="Choose…" required />
            <Field label="Invoice date" name="date" type="date" defaultValue={toInputDate(today())} required />
            <Submit>Continue</Submit>
          </ActionForm>
        )}
      </Card>
    </>
  );
}
