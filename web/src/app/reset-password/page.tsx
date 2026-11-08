import { ActionForm, Field, Select, Submit } from "@/components/forms";
import { getT } from "@/i18n/server";
import { db } from "@/lib/db";
import { resetKeyIsValid } from "@/lib/services/passwords";
import { resetAdmin } from "./actions";

export async function generateMetadata() {
  return { title: (await getT())("Reset an admin's password") };
}

/**
 * For when nobody can sign in as an admin. Only opens with the one-time key that the Windows app's
 * File menu makes on the computer it runs on.
 */
export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const t = await getT();
  const key = (await searchParams).key;
  const valid = typeof key === "string" && resetKeyIsValid(process.env.VIOCHEM_DATA_DIR, key);
  const admins = valid ? await db.user.findMany({ where: { role: "ADMIN" }, orderBy: { name: "asc" } }) : [];
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-accent-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="font-semibold text-slate-900">{t("Reset an admin's password")}</h1>
        {valid ? (
          <ActionForm action={resetAdmin.bind(null, key)} className="mt-4 space-y-4">
            <Select label={t("Admin")} name="user" options={admins.map((a) => ({ value: a.id, label: `${a.name} (${a.email})` }))} />
            <Field label={t("New password")} name="password" type="password" autoComplete="new-password" required minLength={8} dir="ltr" hint={t("At least 8 characters")} />
            <Field label={t("Password again")} name="confirm" type="password" autoComplete="new-password" required dir="ltr" />
            <div className="pt-1 [&>button]:w-full">
              <Submit>{t("Set password and sign in")}</Submit>
            </div>
          </ActionForm>
        ) : (
          <p className="mt-2 text-sm text-slate-600">
            {t("This page only opens from the main computer. In the VIOCHEM app there, open File, then Reset an admin's password.")}
          </p>
        )}
      </div>
    </main>
  );
}
