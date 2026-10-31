import { revalidatePath } from "next/cache";
import { ActionForm, Field, Submit, type FormState } from "@/components/forms";
import { Card, Detail, PageHeader } from "@/components/ui";
import { fail } from "@/lib/actions";
import { getT } from "@/i18n/server";
import { requireAdmin } from "@/lib/auth";
import { invoiceNumbering, setTaxedStart } from "@/lib/services/invoice-numbers";

export async function generateMetadata() {
  return { title: (await getT())("Invoice numbers") };
}

async function save(_: FormState, fd: FormData): Promise<FormState> {
  "use server";
  await requireAdmin();
  try {
    await setTaxedStart(Number(String(fd.get("start") ?? "").trim()));
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/settings/invoices");
  return { ok: "Saved." };
}

export default async function InvoiceNumbersPage() {
  await requireAdmin();
  const t = await getT();
  const n = await invoiceNumbering();
  return (
    <>
      <PageHeader title={t("Invoice numbers")} subtitle={t("Invoices are numbered when they are posted, so a deleted draft leaves no gap.")} />
      <div className="grid max-w-3xl gap-6 md:grid-cols-2">
        <Card title={t("Taxed invoices")}>
          <dl className="mb-4 space-y-2 text-sm">
            <Detail label={t("Next number")}>{n.nextTaxed}</Detail>
          </dl>
          {n.locked ? (
            <p className="text-sm text-slate-600">{t("The series started at {start}. It can't change now that taxed invoices have been posted.", { start: n.taxedStart })}</p>
          ) : (
            <ActionForm action={save}>
              <Field label={t("First taxed invoice number")} name="start" defaultValue={String(n.taxedStart)} inputMode="numeric" dir="ltr" required hint={t("Continue from your last paper or old-system invoice. It locks when the first taxed invoice is posted.")} />
              <Submit>{t("Save")}</Submit>
            </ActionForm>
          )}
        </Card>
        <Card title={t("Non-taxed invoices")}>
          <dl className="space-y-2 text-sm">
            <Detail label={t("Next number")}>{n.nextNonTaxed}</Detail>
          </dl>
          <p className="mt-4 text-sm text-slate-600">{t("Numbered NT-0, NT-1 and so on. They carry no VAT and are never sent to the tax authority.")}</p>
        </Card>
      </div>
    </>
  );
}
