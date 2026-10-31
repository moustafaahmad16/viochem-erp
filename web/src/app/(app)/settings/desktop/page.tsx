import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { ActionForm, Field, Submit, type FormState } from "@/components/forms";
import { Card, PageHeader, Table } from "@/components/ui";
import { fail, text } from "@/lib/actions";
import { getT } from "@/i18n/server";
import { requireAdmin } from "@/lib/auth";
import { backupNow, listBackups } from "@/lib/desktop/backup";
import { backupDir, isDesktop, networkAddresses, readConfig, writeConfig } from "@/lib/desktop/config";
import { cloudFolders, copyOffsite, offsiteStatus } from "@/lib/desktop/offsite";
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

async function saveOffsite(_: FormState, fd: FormData): Promise<FormState> {
  "use server";
  await requireAdmin();
  const dir = text(fd, "offsiteDir") ?? "";
  writeConfig({ offsiteDir: dir });
  revalidatePath("/settings/desktop");
  revalidatePath("/");
  if (!dir) return { ok: "Off-site copies are off." };
  return copyLatest();
}

async function copyLatest(): Promise<FormState> {
  const newest = listBackups()[0] ?? (await backupNow());
  try {
    copyOffsite(newest.path);
  } catch (e) {
    revalidatePath("/settings/desktop");
    return { error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/settings/desktop");
  revalidatePath("/");
  return { ok: "Copied the newest backup to the off-site folder." };
}

async function copyNow(): Promise<FormState> {
  "use server";
  await requireAdmin();
  return copyLatest();
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
  const offsite = offsiteStatus();
  const clouds = cloudFolders();
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
            {t("A full copy is saved on this computer once a day, and before every update. Turn on the off-site copy below so a copy also survives if this computer doesn't.")}
          </p>
          <ActionForm action={saveBackups} className="mt-4 grid gap-3 sm:grid-cols-3 sm:items-end">
            <Field label={t("Backup folder")} name="backupDir" defaultValue={config.backupDir} placeholder={backupDir()} dir="ltr" className="sm:col-span-2" />
            <Field label={t("Backups to keep")} name="keepBackups" type="number" min={1} max={365} defaultValue={config.keepBackups} />
            <div><Submit>{t("Save")}</Submit></div>
          </ActionForm>
          <p className="mt-3 text-xs text-slate-500">{t("To restore a backup, use Restore from backup in the File menu of the app on this computer.")}</p>
        </Card>
        <Card
          title={t("Off-site copy")}
          className="lg:col-span-3"
          actions={offsite.state !== "off" && <ActionForm action={copyNow} className=""><Submit variant="secondary">{t("Copy now")}</Submit></ActionForm>}
        >
          <p className="text-sm text-slate-600">
            {t("Each daily backup is also copied into a Google Drive or OneDrive folder on this computer. The Drive or OneDrive app uploads it, so a copy is safe even if this computer is lost, stolen or broken. The last 14 days and one backup a month for a year are kept there.")}
          </p>
          {offsite.state === "off" ? (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">{t("Off. All backups are only on this computer.")}</p>
          ) : (
            <div className={`mt-3 rounded-lg px-3 py-2 text-sm ${offsite.state === "stale" ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-900"}`}>
              <p className="font-medium">
                {offsite.lastCopyAt ? t("Last off-site copy: {when}", { when: time(offsite.lastCopyAt) }) : t("No off-site copy made yet.")}
              </p>
              {offsite.error && <p className="mt-1">{t("The last try failed: {error}", { error: t.message(offsite.error) })}</p>}
            </div>
          )}
          <ActionForm action={saveOffsite} className="mt-4 grid gap-3 sm:grid-cols-4 sm:items-end">
            <Field
              label={t("Off-site folder")}
              name="offsiteDir"
              defaultValue={offsite.state === "off" ? (clouds[0]?.path ?? "") : offsite.dir}
              placeholder={"G:\\My Drive\\VIOCHEM Backups"}
              dir="ltr"
              className="sm:col-span-3"
              hint={clouds.length ? t("Found on this computer: {folders}", { folders: clouds.map((c) => `${c.name} (${c.path})`).join(", ") }) : t("No Google Drive or OneDrive found on this computer. Install one and sign in, then come back here.")}
            />
            <div><Submit>{offsite.state === "off" ? t("Turn on") : t("Save")}</Submit></div>
          </ActionForm>
          <p className="mt-3 text-xs text-slate-500">{t("To turn it off, empty the folder box and save. To restore on a new computer, install VIOCHEM, sign in to the same Google Drive or OneDrive, and use Restore from backup in the File menu.")}</p>
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
