import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { ActionForm, Field, Submit, type FormState } from "@/components/forms";
import { Card, PageHeader, Table } from "@/components/ui";
import { fail, text } from "@/lib/actions";
import { getT } from "@/i18n/server";
import { requireAdmin } from "@/lib/auth";
import { isDesktop, readConfig } from "@/lib/desktop/config";
import { addRep, checkInbox, ensureKey, inboxStatus, newKey, newRepLink, removeRep, repLink, setInbox, setRepActive } from "@/lib/desktop/inbox";

export async function generateMetadata() {
  return { title: (await getT())("Sales reps outside the office") };
}

const PATH = "/settings/reps";

/** Changes to reps reach the inbox at once, so a new link works straight away. */
async function act(fn: () => unknown | Promise<unknown>, ok: string): Promise<FormState> {
  await requireAdmin();
  try {
    await fn();
  } catch (e) {
    return fail(e);
  }
  let warning: string | null = null;
  if (inboxStatus().on) {
    try {
      await checkInbox();
    } catch (e) {
      warning = e instanceof Error ? e.message : String(e);
    }
  }
  revalidatePath(PATH);
  return warning ? { error: `${ok} ${warning}` } : { ok };
}

/** Saves the address, then checks at once so a mistake shows straight away. */
async function saveAddress(_: FormState, fd: FormData): Promise<FormState> {
  "use server";
  await requireAdmin();
  try {
    const inbox = setInbox(text(fd, "url") ?? "", readConfig().inbox.key);
    if (!inbox.url) {
      revalidatePath(PATH);
      return { ok: "The inbox is off. Reps' links stop working until an address is saved again." };
    }
    await checkInbox();
  } catch (e) {
    revalidatePath(PATH);
    return fail(e);
  }
  revalidatePath(PATH);
  return { ok: "Saved, and the inbox answered." };
}

async function checkNow(): Promise<FormState> {
  "use server";
  await requireAdmin();
  let saved: number;
  try {
    saved = (await checkInbox()).saved;
  } catch (e) {
    revalidatePath(PATH);
    return fail(e);
  }
  revalidatePath(PATH);
  revalidatePath("/requests");
  return { ok: saved ? `Checked. New requests saved: ${saved}.` : "Checked. No new requests." };
}

async function replaceKey(): Promise<FormState> {
  "use server";
  await requireAdmin();
  setInbox(readConfig().inbox.url, newKey());
  revalidatePath(PATH);
  return { ok: "New key made. Put it in the inbox's INBOX_KEY secret in Cloudflare, or the app can't collect requests." };
}

async function add(_: FormState, fd: FormData): Promise<FormState> {
  "use server";
  return act(() => addRep(text(fd, "name") ?? ""), "Rep added. Send them their link.");
}

async function toggle(id: number, active: boolean): Promise<FormState> {
  "use server";
  return act(() => setRepActive(id, active), active ? "Link turned on." : "Link turned off.");
}

async function relink(id: number): Promise<FormState> {
  "use server";
  return act(() => newRepLink(id), "New link made. The old one no longer works.");
}

async function remove(id: number): Promise<FormState> {
  "use server";
  return act(() => removeRep(id), "Rep removed.");
}

/** Where sales reps outside the office send customer requests, and their personal links. */
export default async function SalesRepsPage() {
  await requireAdmin();
  if (!isDesktop()) notFound();
  const t = await getT();
  const inbox = ensureKey();
  const status = inboxStatus();
  const time = (d: Date) => `${t.date(d)} ${d.toTimeString().slice(0, 5)}`;
  const steps = [
    t("Sign up for free at dash.cloudflare.com (no card needed)."),
    t("Workers & Pages → Create → Start with Hello World → Deploy. Then Edit code, delete what is there, paste in the inbox code downloaded below, and Deploy."),
    t("Storage & Databases → D1 → Create a database named viochem-inbox. Then in the worker: Bindings → Add binding → D1 database, variable name DB, database viochem-inbox."),
    t("In the worker: Settings → Variables and Secrets → Add → type Secret, name INBOX_KEY, value: the key on this page. Deploy."),
    t("Copy the worker's address (ending in workers.dev) into Inbox address on this page and save."),
  ];

  return (
    <>
      <PageHeader title={t("Sales reps outside the office")} subtitle={t("Reps send customer requests from any phone, anywhere. They arrive under Customer requests.")} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card
          title={t("Online inbox")}
          className="lg:col-span-2"
          actions={status.on && <ActionForm action={checkNow} className=""><Submit variant="secondary">{t("Check now")}</Submit></ActionForm>}
        >
          <p className="text-sm text-slate-600">
            {t("Reps' requests wait in a small free online inbox until this app collects them, every 2 minutes while it is open. VIOCHEM itself stays on the office network: only the request form is online, and it shows product and customer names, never prices or stock.")}
          </p>
          {!status.on ? (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">{t("Not set up yet. Follow the steps below once.")}</p>
          ) : (
            <div className={`mt-3 rounded-lg px-3 py-2 text-sm ${status.error ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-900"}`}>
              <p className="font-medium">
                {status.lastOkAt ? t("Last checked: {when}", { when: time(status.lastOkAt) }) : t("Not checked yet.")}
                {status.lastReceivedAt && <> · {t("Last request received: {when}", { when: time(status.lastReceivedAt) })}</>}
              </p>
              {status.error && <p className="mt-1">{t("The last check failed: {error}", { error: t.message(status.error) })}</p>}
            </div>
          )}
          <ActionForm action={saveAddress} className="mt-4 grid gap-3 sm:grid-cols-4 sm:items-end">
            <Field label={t("Inbox address")} name="url" defaultValue={inbox.url} placeholder="https://viochem-inbox.yourname.workers.dev" dir="ltr" className="sm:col-span-3" />
            <div><Submit>{t("Save")}</Submit></div>
          </ActionForm>
          <div className="mt-4">
            <p className="text-sm font-medium text-slate-700">{t("Key")}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <code className="rounded bg-slate-100 px-2 py-1.5 text-xs break-all" dir="ltr">{inbox.key}</code>
              <CopyButton text={inbox.key} />
              <ActionForm action={replaceKey} className="">
                <Submit variant="secondary" confirm="The inbox stops accepting this app until the new key is put in Cloudflare. Make a new key?">{t("Make a new key")}</Submit>
              </ActionForm>
            </div>
            <p className="mt-1 text-xs text-slate-500">{t("The inbox only lets this app in with this key. Keep it private.")}</p>
          </div>
        </Card>
        <Card title={t("Set it up (once, about 10 minutes)")}>
          <ol className="list-decimal space-y-2 ps-5 text-sm text-slate-700">
            {steps.map((s) => <li key={s}>{s}</li>)}
          </ol>
          <a href="/settings/reps/inbox" className="mt-4 inline-block text-sm font-medium text-brand-700 underline">{t("Download the inbox code")}</a>
          <p className="mt-2 text-xs text-slate-500">{t("Cloudflare's free plan is enough: up to 100,000 visits a day.")}</p>
        </Card>
        <Card title={t("Reps")} className="lg:col-span-3">
          <p className="text-sm text-slate-600">{t("Each rep gets a personal link to open on their phone. Send it by WhatsApp. If a phone is lost or someone leaves, turn their link off or make a new one.")}</p>
          <ActionForm action={add} resetOnSuccess className="mt-4 grid gap-3 sm:grid-cols-4 sm:items-end">
            <Field label={t("Rep name")} name="name" required className="sm:col-span-3" />
            <div><Submit>{t("Add rep")}</Submit></div>
          </ActionForm>
          <div className="mt-4 -mx-4 sm:mx-0">
            <Table head={<tr><th>{t("Rep")}</th><th>{t("Link")}</th><th>{t("Status")}</th><th></th></tr>} empty={t("No reps yet.")}>
              {inbox.reps.map((r) => {
                const link = inbox.url ? repLink(inbox.url, r.code) : null;
                const whatsapp = link && `https://wa.me/?text=${encodeURIComponent(`${t("VIOCHEM customer requests: open this link to send a request to the office")}\n${link}`)}`;
                return (
                  <tr key={r.id}>
                    <td className="font-medium">{r.name}</td>
                    <td>
                      {link ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="max-w-xs truncate text-xs text-slate-500" dir="ltr">{link}</span>
                          {r.active && <CopyButton text={link} label="Copy link" />}
                          {r.active && whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer" className="text-sm font-medium text-emerald-700 underline">{t("Send by WhatsApp")}</a>}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">{t("Save the inbox address first.")}</span>
                      )}
                    </td>
                    <td>{r.active ? <span className="text-emerald-700">{t("Link on")}</span> : <span className="text-slate-500">{t("Link off")}</span>}</td>
                    <td>
                      <div className="flex flex-wrap justify-end gap-2">
                        <ActionForm action={toggle.bind(null, r.id, !r.active)} className="">
                          <Submit variant="secondary">{r.active ? t("Turn off") : t("Turn on")}</Submit>
                        </ActionForm>
                        <ActionForm action={relink.bind(null, r.id)} className="">
                          <Submit variant="secondary" confirm="The old link stops working. Make a new link?">{t("New link")}</Submit>
                        </ActionForm>
                        <ActionForm action={remove.bind(null, r.id)} className="">
                          <Submit variant="danger" confirm="Remove this rep? Their link stops working. Requests they already sent are kept.">{t("Remove")}</Submit>
                        </ActionForm>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </Table>
          </div>
        </Card>
      </div>
    </>
  );
}
