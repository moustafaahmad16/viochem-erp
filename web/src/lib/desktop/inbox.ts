import { createHash, randomBytes } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { db, sameName } from "@/lib/db";
import { today } from "@/lib/dates";
import { createRequest, type RequestLineInput } from "@/lib/services/requests";
import { readConfig, writeConfig, type InboxConfig, type SalesRep } from "./config";

/**
 * Requests from sales reps outside the office. The app on this computer is only reachable on the
 * office Wi-Fi, so reps send requests to a small online inbox instead (inbox/viochem-inbox.js, a
 * free Cloudflare Worker). Every few minutes the app sends up the list of reps, customer names and
 * product names the reps' form offers, collects the requests waiting there, saves each one as a
 * customer request, and then removes it from the inbox. Nothing ever connects in to this computer.
 */

/** How often the app looks for new requests while it is open. */
export const CHECK_EVERY_MS = 2 * 60 * 1000;

/** Each rep's link carries a code nobody can guess. */
export const newCode = () => randomBytes(18).toString("base64url");
/** The key the app and the inbox share. */
export const newKey = () => randomBytes(32).toString("base64url");

export const repLink = (url: string, code: string) => `${url.replace(/\/+$/, "")}/r/${code}`;

export type InboxRequest = {
  id: string;
  rep: { id: number; name: string };
  customerId: number | null;
  customerName: string;
  phone: string | null;
  notes: string | null;
  lines: { itemId: number | null; name: string; qty: string; unit: string }[];
  sentAt: string;
};

type State = { lastCheckAt?: string; lastOkAt?: string; lastError?: string | null; catalogHash?: string; received?: number; lastReceivedAt?: string };
const stateFile = () => path.join(process.env.VIOCHEM_DATA_DIR ?? "", "inbox.json");

function readState(): State {
  try {
    return JSON.parse(readFileSync(stateFile(), "utf8"));
  } catch {
    return {};
  }
}

function writeState(change: Partial<State>) {
  const next = { ...readState(), ...change };
  writeFileSync(`${stateFile()}.tmp`, JSON.stringify(next, null, 2));
  renameSync(`${stateFile()}.tmp`, stateFile());
}

export type InboxStatus = {
  on: boolean;
  lastCheckAt: Date | null;
  lastOkAt: Date | null;
  error: string | null;
  received: number;
  lastReceivedAt: Date | null;
};

export function inboxStatus(): InboxStatus {
  const c = readConfig().inbox;
  const s = readState();
  const d = (v?: string) => (v ? new Date(v) : null);
  return {
    on: Boolean(c.url && c.key),
    lastCheckAt: d(s.lastCheckAt),
    lastOkAt: d(s.lastOkAt),
    error: s.lastError ?? null,
    received: s.received ?? 0,
    lastReceivedAt: d(s.lastReceivedAt),
  };
}

// ---- Reps --------------------------------------------------------------------------------------

function saveInbox(change: Partial<InboxConfig>) {
  const inbox = { ...readConfig().inbox, ...change };
  writeConfig({ inbox });
  // The reps' form changes, so it is sent up again on the next check.
  writeState({ catalogHash: undefined });
  return inbox;
}

export function setInbox(url: string, key: string) {
  const clean = url.trim().replace(/\/+$/, "");
  // http is only allowed for an inbox running on this computer, for trying it out.
  if (clean && !/^(https:\/\/[\w.-]+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)(\/[\w./-]*)?$/.test(clean)) throw new Error("The inbox address must start with https://, like https://viochem-inbox.yourname.workers.dev");
  return saveInbox({ url: clean, key });
}

export function addRep(name: string): SalesRep {
  const n = name.trim();
  if (!n) throw new Error("Type the rep's name.");
  const reps = readConfig().inbox.reps;
  if (reps.some((r) => sameName(r.name, n))) throw new Error("There is already a rep with this name.");
  const rep = { id: Math.max(0, ...reps.map((r) => r.id)) + 1, name: n, code: newCode(), active: true };
  saveInbox({ reps: [...reps, rep] });
  return rep;
}

/** Turns a rep's link off or on again. */
export function setRepActive(id: number, active: boolean) {
  saveInbox({ reps: readConfig().inbox.reps.map((r) => (r.id === id ? { ...r, active } : r)) });
}

/** A new link for a rep; the old one stops working, e.g. after a phone is lost. */
export function newRepLink(id: number) {
  saveInbox({ reps: readConfig().inbox.reps.map((r) => (r.id === id ? { ...r, code: newCode(), active: true } : r)) });
}

export function removeRep(id: number) {
  saveInbox({ reps: readConfig().inbox.reps.filter((r) => r.id !== id) });
}

// ---- Saving a request --------------------------------------------------------------------------

/**
 * Saves one request from the inbox as a customer request. A customer picked from the list is used
 * as is; a name typed in is matched to one of ours, or else added as a new customer.
 * Saving the same request twice keeps one.
 */
export async function saveInboxRequest(r: InboxRequest) {
  const existing = await db.customerRequest.findUnique({ where: { inboxId: r.id } });
  if (existing) return { request: existing, created: false };

  const name = r.customerName.trim();
  const customers = await db.customer.findMany({ select: { id: true, name: true, phone: true } });
  let customer = (r.customerId ? customers.find((c) => c.id === r.customerId) : undefined) ?? customers.find((c) => sameName(c.name, name));
  let newCustomer = false;
  if (!customer) {
    customer = await db.customer.create({
      data: { name, phone: r.phone, notes: `Added from a request by ${r.rep.name}` },
      select: { id: true, name: true, phone: true },
    });
    newCustomer = true;
  }

  const items = new Set((await db.item.findMany({ where: { active: true }, select: { id: true } })).map((i) => i.id));
  const lines: RequestLineInput[] = r.lines.map((l) =>
    l.itemId && items.has(l.itemId)
      ? { itemId: l.itemId, productName: null, casNumber: null, unit: null, qty: l.qty }
      : // A CAS number typed in is read as one, so the product is linked to ours if we have it.
        /^\d{2,7}-?\d{2}-?\d$/.test(l.name.trim())
        ? { itemId: null, productName: null, casNumber: l.name.trim(), unit: l.unit, qty: l.qty }
        : { itemId: null, productName: l.name, casNumber: null, unit: l.unit, qty: l.qty },
  );
  const phone = !newCustomer && r.phone && r.phone !== customer.phone ? `Phone: ${r.phone}` : null;
  const notes = [r.notes, phone].filter(Boolean).join("\n") || null;
  try {
    const request = await createRequest(customer.id, today(), lines, notes, { sentBy: r.rep.name, inboxId: r.id });
    return { request, created: true };
  } catch (e) {
    // Saved meanwhile by another check.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const request = await db.customerRequest.findUnique({ where: { inboxId: r.id } });
      if (request) return { request, created: false };
    }
    throw e;
  }
}

// ---- Talking to the inbox ----------------------------------------------------------------------

async function catalog(inbox: InboxConfig) {
  const [customers, items] = await Promise.all([
    db.customer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.item.findMany({ where: { active: true }, select: { id: true, name: true, unit: true }, orderBy: { name: "asc" } }),
  ]);
  return { reps: inbox.reps.filter((r) => r.active).map(({ id, name, code }) => ({ id, name, code })), customers, items };
}

type Fetch = typeof fetch;

async function call(inbox: InboxConfig, fetchFn: Fetch, method: string, route: string, body?: unknown) {
  let res: Response;
  try {
    res = await fetchFn(`${inbox.url}${route}`, {
      method,
      headers: { Authorization: `Bearer ${inbox.key}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new Error("Couldn't reach the inbox. Check this computer's internet connection and the inbox address.");
  }
  if (res.status === 401) throw new Error("The inbox refused the key. Copy the key from this page into the inbox's INBOX_KEY secret again.");
  if (res.status === 503) throw new Error("The inbox has no INBOX_KEY secret yet. Add it in Cloudflare (step 4 of the setup).");
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (/no such table|D1|binding|DB/i.test(text) || res.status === 500) throw new Error("The inbox isn't working yet. Check that its D1 database is connected with the name DB (step 3 of the setup).");
    throw new Error(`The inbox answered with an error (${res.status}).`);
  }
  return res.json();
}

let running: Promise<{ saved: number }> | null = null;

/**
 * Sends the reps' form its lists if they changed, then collects and saves waiting requests.
 * A request is removed from the inbox only once it is saved here.
 */
export function checkInbox(fetchFn: Fetch = fetch): Promise<{ saved: number }> {
  running ??= (async () => {
    const inbox = readConfig().inbox;
    if (!inbox.url || !inbox.key) return { saved: 0 };
    const now = new Date().toISOString();
    try {
      const cat = await catalog(inbox);
      const hash = createHash("sha256").update(JSON.stringify(cat)).digest("hex");
      if (hash !== readState().catalogHash) {
        await call(inbox, fetchFn, "PUT", "/api/catalog", cat);
        writeState({ catalogHash: hash });
      }
      const { requests } = (await call(inbox, fetchFn, "GET", "/api/requests")) as { requests: InboxRequest[] };
      const done: string[] = [];
      let saved = 0;
      let firstError: unknown = null;
      for (const r of requests) {
        try {
          if ((await saveInboxRequest(r)).created) saved++;
          done.push(r.id);
        } catch (e) {
          console.error(`Couldn't save the request ${r.id} from the inbox`, e);
          firstError ??= e;
        }
      }
      if (done.length) await call(inbox, fetchFn, "POST", "/api/requests/collected", { ids: done });
      const s = readState();
      writeState({
        lastCheckAt: now,
        lastOkAt: now,
        lastError: firstError ? `A request from ${requests.find((r) => !done.includes(r.id))?.rep.name ?? "a rep"} couldn't be saved: ${firstError instanceof Error ? firstError.message : String(firstError)}` : null,
        ...(saved ? { received: (s.received ?? 0) + saved, lastReceivedAt: now } : {}),
      });
      return { saved };
    } catch (e) {
      writeState({ lastCheckAt: now, lastError: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Checks the inbox every few minutes while the app is open. */
export function scheduleInbox() {
  const tick = () =>
    checkInbox().catch(() => {
      // Kept in inbox.json and shown under Settings → Sales reps.
    });
  void tick();
  setInterval(tick, CHECK_EVERY_MS).unref();
}

/** Makes the shared key the first time the settings page is opened. */
export function ensureKey() {
  const inbox = readConfig().inbox;
  if (inbox.key) return inbox;
  return saveInbox({ key: newKey() });
}
