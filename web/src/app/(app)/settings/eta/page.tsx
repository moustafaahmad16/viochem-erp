import { revalidatePath } from "next/cache";
import { ActionForm, Field, Select, Submit, type FormState } from "@/components/forms";
import { Badge, Card, Detail, PageHeader } from "@/components/ui";
import { fail, text } from "@/lib/actions";
import { getT } from "@/i18n/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { accessToken, etaConfig } from "@/lib/eta/client";
import { etaSettings } from "@/lib/services/einvoice";
import { UserError } from "@/lib/services/errors";

export async function generateMetadata() {
  return { title: (await getT())("E-invoice settings") };
}

async function save(_: FormState, fd: FormData): Promise<FormState> {
  "use server";
  await requireAdmin();
  try {
    const taxId = text(fd, "taxId") ?? "";
    if (taxId && !/^\d{9}$/.test(taxId)) throw new UserError("The tax registration number is 9 digits.");
    await db.etaSettings.upsert({
      where: { id: 1 },
      create: {},
      update: {
        taxId,
        name: text(fd, "name") ?? "VIOCHEM",
        activityCode: text(fd, "activityCode") ?? "",
        branchId: text(fd, "branchId") ?? "0",
        governate: text(fd, "governate") ?? "",
        city: text(fd, "city") ?? "",
        street: text(fd, "street") ?? "",
        buildingNo: text(fd, "buildingNo") ?? "",
        postalCode: text(fd, "postalCode"),
        documentVersion: text(fd, "documentVersion") === "0.9" ? "0.9" : "1.0",
      },
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/settings/eta");
  return { ok: "Saved." };
}

async function testLogin(): Promise<FormState> {
  "use server";
  await requireAdmin();
  try {
    await accessToken();
  } catch (e) {
    return fail(e);
  }
  return { ok: "Logged in to the tax authority." };
}

const Yes = async ({ on }: { on: boolean }) => {
  const t = await getT();
  return on ? <Badge color="green">{t("Set")}</Badge> : <Badge color="amber">{t("Not set")}</Badge>;
};

export default async function EtaSettingsPage() {
  await requireAdmin();
  const s = await etaSettings();
  const c = etaConfig();
  const t = await getT();
  return (
    <>
      <PageHeader title={t("E-invoice settings")} subtitle={t("How VIOCHEM is registered with the Egyptian Tax Authority")} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title={t("VIOCHEM's details")} className="lg:col-span-2">
          <ActionForm action={save}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("Registered name")} name="name" defaultValue={s.name} required />
              <Field label={t("Tax registration number")} name="taxId" defaultValue={s.taxId} inputMode="numeric" hint={t("9 digits")} />
              <Field label={t("Activity code")} name="activityCode" defaultValue={s.activityCode} hint={t("From the ETA portal, e.g. 4669")} />
              <Field label={t("Branch ID")} name="branchId" defaultValue={s.branchId} hint={t("0 for the main branch")} />
              <Field label={t("Governorate")} name="governate" defaultValue={s.governate} />
              <Field label={t("City or area")} name="city" defaultValue={s.city} />
              <Field label={t("Street")} name="street" defaultValue={s.street} />
              <Field label={t("Building no.")} name="buildingNo" defaultValue={s.buildingNo} />
              <Field label={t("Postal code")} name="postalCode" defaultValue={s.postalCode ?? ""} />
              <Select
                label={t("Document version")}
                name="documentVersion"
                defaultValue={s.documentVersion}
                options={[{ value: "1.0", label: t("1.0 (signed, for real invoices)") }, { value: "0.9", label: t("0.9 (unsigned, pre-production testing only)") }]}
              />
            </div>
            <Submit>{t("Save")}</Submit>
          </ActionForm>
        </Card>
        <Card title={t("Connection")}>
          <dl className="space-y-3">
            <Detail label={t("Environment")}>{t(c.environment === "production" ? "Production (real invoices)" : "Pre-production (testing)")}</Detail>
            <Detail label={t("Client ID and secret")}><Yes on={Boolean(c.clientId && c.clientSecret)} /></Detail>
            <Detail label={t("Signing service")}><Yes on={Boolean(c.signerUrl)} /></Detail>
          </dl>
          <p className="mt-4 text-xs text-slate-500">
            {t("These are kept in Vercel, not here: ETA_ENVIRONMENT, ETA_CLIENT_ID, ETA_CLIENT_SECRET and ETA_SIGNER_URL. After changing them, redeploy.")}
          </p>
          <div className="mt-4">
            <ActionForm action={testLogin}>
              <Submit variant="secondary">{t("Test the login")}</Submit>
            </ActionForm>
          </div>
        </Card>
      </div>
    </>
  );
}
