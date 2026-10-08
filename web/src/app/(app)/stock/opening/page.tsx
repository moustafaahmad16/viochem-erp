import { ActionForm, Field, Select, Submit } from "@/components/forms";
import { ButtonLink, Card, PageHeader } from "@/components/ui";
import { toInputDate, today } from "@/lib/dates";
import { db } from "@/lib/db";
import { createOpeningStock } from "../actions";

export const metadata = { title: "Opening stock" };

export default async function OpeningStockPage({ searchParams }: PageProps<"/stock/opening">) {
  const selected = String((await searchParams).item ?? "");
  const items = await db.item.findMany({ where: { active: true }, orderBy: { name: "asc" } });

  return (
    <>
      <PageHeader
        title="Add opening stock"
        subtitle="For stock already in the warehouse before you started using VIOCHEM. Enter each lot separately."
        back={{ href: "/stock", label: "Stock on hand" }}
      />
      <Card className="max-w-2xl">
        {items.length === 0 ? (
          <div className="space-y-3 text-sm text-slate-600">
            <p>Add your products first.</p>
            <ButtonLink href="/products/new">Add a product</ButtonLink>
          </div>
        ) : (
          <ActionForm action={createOpeningStock} className="grid gap-4 sm:grid-cols-2">
            <Select label="Product" name="itemId" defaultValue={selected} options={items.map((i) => ({ value: i.id, label: `${i.name} (${i.code})` }))} className="sm:col-span-2" placeholder="Choose…" required />
            <Field label="Quantity" name="qty" inputMode="decimal" required />
            <Field label="Cost per unit (EGP)" name="unitCostEgp" inputMode="decimal" required hint="What this lot really cost you, landed" />
            <Field label="Supplier batch no." name="supplierBatchNo" />
            <Field label="Expiry date" name="expiryDate" type="date" />
            <Field label="As of date" name="date" type="date" defaultValue={toInputDate(today())} required />
            <div className="sm:col-span-2">
              <Submit>Add stock</Submit>
            </div>
          </ActionForm>
        )}
      </Card>
    </>
  );
}
