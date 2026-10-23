import { revalidatePath } from "next/cache";
import { ActionForm, Field, Submit, type FormState } from "@/components/forms";
import { Card, PageHeader } from "@/components/ui";
import { fail, text } from "@/lib/actions";
import { getT } from "@/i18n/server";
import { checkPassword, requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { backupNow } from "@/lib/desktop/backup";
import { isDesktop } from "@/lib/desktop/config";
import { clearAll } from "@/lib/services/clear";
import { UserError } from "@/lib/services/errors";

export async function generateMetadata() {
  return { title: (await getT())("Clear all data") };
}

async function clear(_: FormState, fd: FormData): Promise<FormState> {
  "use server";
  const user = await requireAdmin();
  try {
    if (!(await checkPassword(user, text(fd, "password") ?? ""))) throw new UserError("That password isn't right.");
    // On the Windows app a copy is kept first, so the data can be restored from the File menu.
    if (isDesktop()) await backupNow();
    await clearAll();
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/", "layout");
  return { ok: "All data is cleared." };
}

/** Wipes the business data, to start again after trying the system out. Admins only, with their password. */
export default async function ClearDataPage() {
  await requireAdmin();
  const t = await getT();
  const [items, customers, suppliers, invoices, shipments] = await Promise.all([db.item.count(), db.customer.count(), db.supplier.count(), db.invoice.count(), db.shipment.count()]);
  return (
    <>
      <PageHeader title={t("Clear all data")} subtitle={t("Start again with an empty system")} />
      <Card title={t("Clear all data")} className="max-w-2xl">
        <p className="text-sm text-slate-600">
          {t("This deletes every product, customer, supplier, invoice, quotation, credit note, shipment, purchase order, payment, cheque, expense, bank and cash account, and all stock. Numbering starts again from 1.")}
        </p>
        <p className="mt-2 text-sm text-slate-600">{t("Users, e-invoice settings and the chart of accounts are kept.")}</p>
        <p className="mt-2 text-sm font-medium text-slate-800">
          {t("Now: {items} products, {customers} customers, {suppliers} suppliers, {invoices} invoices, {shipments} shipments.", { items, customers, suppliers, invoices, shipments })}
        </p>
        <p className="mt-2 text-sm text-red-700">
          {isDesktop() ? t("A backup is saved first, so it can be undone with Restore from backup in the File menu.") : t("This can't be undone.")}
        </p>
        <ActionForm action={clear} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end" resetOnSuccess>
          <Field label={t("Your password")} name="password" type="password" autoComplete="current-password" required dir="ltr" />
          <div><Submit variant="danger" confirm="Delete all data? This removes every product, customer, invoice and record.">{t("Clear all data")}</Submit></div>
        </ActionForm>
      </Card>
    </>
  );
}
