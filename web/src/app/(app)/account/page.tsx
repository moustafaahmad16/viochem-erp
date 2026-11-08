import { ActionForm, Field, Submit, type FormState } from "@/components/forms";
import { Card, PageHeader } from "@/components/ui";
import { fail } from "@/lib/actions";
import { getT } from "@/i18n/server";
import { requireUser } from "@/lib/auth";
import { changeOwnPassword } from "@/lib/services/passwords";

export async function generateMetadata() {
  return { title: (await getT())("Change password") };
}

async function changePassword(_: FormState, fd: FormData): Promise<FormState> {
  "use server";
  const me = await requireUser();
  try {
    await changeOwnPassword(me.id, String(fd.get("current") ?? ""), String(fd.get("password") ?? ""), String(fd.get("confirm") ?? ""));
  } catch (e) {
    return fail(e);
  }
  return { ok: "Your password is changed." };
}

/** Every user changes their own password here. */
export default async function AccountPage() {
  const me = await requireUser();
  const t = await getT();
  return (
    <>
      <PageHeader title={t("Change password")} subtitle={me.email} />
      <Card className="max-w-md">
        <ActionForm action={changePassword} resetOnSuccess>
          <Field label={t("Current password")} name="current" type="password" autoComplete="current-password" required dir="ltr" />
          <Field label={t("New password")} name="password" type="password" autoComplete="new-password" required minLength={8} dir="ltr" hint={t("At least 8 characters")} />
          <Field label={t("Password again")} name="confirm" type="password" autoComplete="new-password" required dir="ltr" />
          <Submit>{t("Change password")}</Submit>
        </ActionForm>
      </Card>
    </>
  );
}
