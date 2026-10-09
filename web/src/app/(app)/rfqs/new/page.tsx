import { ActionForm, Field, Submit, TextArea } from "@/components/forms";
import { Card, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { lowStock } from "@/lib/services/alerts";
import { getT } from "@/i18n/server";
import { createRfq } from "../actions";
import { ProductRows } from "../product-rows";

export async function generateMetadata() {
  return { title: (await getT())("New request for quotation") };
}

export default async function NewRfqPage({ searchParams }: PageProps<"/rfqs/new">) {
  const t = await getT();
  const fromLow = (await searchParams).from === "low-stock";
  const [items, low] = await Promise.all([
    db.item.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    fromLow ? lowStock() : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title={t("New request for quotation")}
        subtitle={t("Choose the products and quantities, then save. Next you'll download the sheet to send suppliers.")}
        back={{ href: "/rfqs", label: t("Requests for quotation") }}
      />
      <ActionForm action={createRfq} className="max-w-4xl space-y-4">
        <Card padded={false}>
          <ProductRows
            items={items.map((i) => ({ id: i.id, code: i.code, name: i.name, cas: i.casNumber, unit: i.unit }))}
            initial={low.filter((r) => r.short.gt(0)).map((r) => ({ itemId: r.itemId, qty: r.short.toString() }))}
          />
        </Card>
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-600">{t("More options")}</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label={t("Needed in Egypt by")} name="neededBy" type="date" hint={t("Offers that would arrive later count as more expensive.")} />
            <TextArea label={t("Notes for suppliers")} name="notes" placeholder={t("e.g. CIF Alexandria, COA and MSDS with the offer")} />
          </div>
        </details>
        <Submit>{t("Save")}</Submit>
      </ActionForm>
    </>
  );
}
