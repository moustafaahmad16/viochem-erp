import { ActionForm, Field, Submit } from "@/components/forms";
import { getT } from "@/i18n/server";
import { LangSwitch } from "@/i18n/switch";
import { db } from "@/lib/db";
import { isDesktop } from "@/lib/desktop/config";
import { login, setup } from "./actions";

export async function generateMetadata() {
  return { title: (await getT())("Sign in") };
}

export default async function LoginPage() {
  const t = await getT();
  // The Windows app on its first start has nobody to sign in as, so it asks for the first admin.
  const firstRun = isDesktop() && (await db.user.count()) === 0;
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-accent-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Viochem for Trading and Industry" className="mx-auto h-24 w-auto" />
          <div className="mt-1 text-sm text-slate-500">{t("Aroma chemicals · Imports · Sales")}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {firstRun ? (
            <ActionForm action={setup}>
              <div>
                <h1 className="font-semibold text-slate-900">{t("Welcome to VIOCHEM")}</h1>
                <p className="mt-1 text-sm text-slate-500">{t("Create the first admin. You can add everyone else afterwards, under Users.")}</p>
              </div>
              <Field label={t("Name")} name="name" required autoFocus />
              <Field label={t("Email")} name="email" type="email" autoComplete="email" required dir="ltr" />
              <Field label={t("Password")} name="password" type="password" autoComplete="new-password" required minLength={8} dir="ltr" hint={t("At least 8 characters")} />
              <Field label={t("Password again")} name="confirm" type="password" autoComplete="new-password" required dir="ltr" />
              <div className="pt-1 [&>button]:w-full">
                <Submit>{t("Create admin and start")}</Submit>
              </div>
            </ActionForm>
          ) : (
            <ActionForm action={login}>
              <Field label={t("Email")} name="email" type="email" autoComplete="email" required autoFocus dir="ltr" />
              <Field label={t("Password")} name="password" type="password" autoComplete="current-password" required dir="ltr" />
              <div className="pt-1 [&>button]:w-full">
                <Submit>{t("Sign in")}</Submit>
              </div>
            </ActionForm>
          )}
        </div>
        <div className="mt-4 text-center">
          <LangSwitch />
        </div>
      </div>
    </main>
  );
}
