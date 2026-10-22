import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { ActionForm, Field, Submit, type FormState } from "@/components/forms";
import { Card, PageHeader, Table } from "@/components/ui";
import { fail, text } from "@/lib/actions";
import { getT } from "@/i18n/server";
import { requireAdmin } from "@/lib/auth";
import { backupNow, listBackups } from "@/lib/desktop/backup";
import { backupDir, isDesktop, networkAddresses, readConfig, writeConfig } from "@/lib/desktop/config";
import { UserError } from "@/lib/services/errors";

export async function generateMetadata() {
  return { title: (await getT())("Sharing and backups") };
}

async function backup(): Promise<FormState> {
  "use server";
  await requireAdmin();
  try {
    await backupNow();
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/settings/desktop");
  return { ok: "Backed up." };
}

async function saveBackups(_: FormState, fd: FormData): Promise<FormState> {
  "use server";
  await requireAdmin();
  try {
    const keep = Number(text(fd, "keepBackups") ?? 30);
    if (!Number.isInteger(keep) || keep < 1 || keep > 365) throw new UserError("Keep between 1 and 365 backups.");
    writeConfig({ backupDir: text(fd, "backupDir") ?? "", keepBackups: keep });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/settings/desktop");
  return { ok: "Saved." };
}

const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/** The Windows app's own settings: where other devices open it, and the daily backups. */
export default async function DesktopSettingsPage() {
  await requireAdmin();
  if (!isDesktop()) notFound();
  const t = await getT();
  const config = readConfig();
  const backups = listBackups();
  const time = (d: Date) => `${t.date(d)} ${d.toTimeString().slice(0, 5)}`;
  return (
    <>
      <PageHeader title={t("Sharing and backups")} subtitle={t("VIOCHEM runs on this computer and keeps its data here")} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title={t("Open it on other devices")}>
          <p className="text-sm text-slate-600">{t("Any computer or phone on the same Wi-Fi as this computer can open VIOCHEM in its browser, at:")}</p>
          <ul className="mt-3 space-y-1 text-sm font-medium" dir="ltr">
            {networkAddresses().map((url) => (
              <li key={url}>
                <a href={url} className="text-brand-700 underline">{url}</a>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">{t("This computer must be on, with VIOCHEM open. Everyone signs in with their own user and sees the same data.")}</p>
        </Card>
        <Card title={t("Backups")} className="lg:col-span-2" actions={<ActionForm action={backup} className=""><Submit variant="secondary">{t("Back up now")}</Submit></ActionForm>}>
          <p className="text-sm text-slate-600">
            {t("A full copy is saved once a day, and before every update. Keep the backup folder on a USB drive or a synced folder like OneDrive, so a copy survives if this computer doesn't.")}
          </p>
          <ActionForm action={saveBackups} className="mt-4 grid gap-3 sm:grid-cols-3 sm:items-end">
            <Field label={t("Backup folder")} name="backupDir" defaultValue={config.backupDir} placeholder={backupDir()} dir="ltr" className="sm:col-span-2" />
            <Field label={t("Backups to keep")} name="keepBackups" type="number" min={1} max={365} defaultValue={config.keepBackups} />
            <div><Submit>{t("Save")}</Submit></div>
          </ActionForm>
          <p className="mt-3 text-xs text-slate-500">{t("To restore a backup, use Restore from backup in the File menu of the app on this computer.")}</p>
        </Card>
        <Card padded={false} className="lg:col-span-3">
          <Table head={<tr><th>{t("Backup")}</th><th>{t("Saved")}</th><th className="text-end">{t("Size")}</th></tr>} empty={t("No backups yet.")}>
            {backups.map((b) => (
              <tr key={b.name}>
                <td dir="ltr">{b.name}</td>
                <td>{time(b.at)}</td>
                <td className="text-end" dir="ltr">{size(b.size)}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
