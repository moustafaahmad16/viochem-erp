import { ActionForm } from "@/components/forms";
import { Card, PageHeader } from "@/components/ui";
import { getT } from "@/i18n/server";
import { createItem } from "../actions";
import { ItemFields } from "../item-form";

export async function generateMetadata() {
  return { title: (await getT())("New product") };
}

export default async function NewProductPage() {
  const t = await getT();
  return (
    <>
      <PageHeader title={t("New product")} back={{ href: "/products", label: t("Products") }} />
      <Card>
        <ActionForm action={createItem}>
          <ItemFields t={t} />
        </ActionForm>
      </Card>
    </>
  );
}
