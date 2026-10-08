import { ActionForm } from "@/components/forms";
import { Card, PageHeader } from "@/components/ui";
import { createItem } from "../actions";
import { ItemFields } from "../item-form";

export const metadata = { title: "New product" };

export default function NewProductPage() {
  return (
    <>
      <PageHeader title="New product" back={{ href: "/products", label: "Products" }} />
      <Card>
        <ActionForm action={createItem}>
          <ItemFields />
        </ActionForm>
      </Card>
    </>
  );
}
