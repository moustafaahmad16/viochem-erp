import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { readConfig } from "@/lib/desktop/config";
import { addRep, checkInbox, inboxStatus, newRepLink, setInbox, setRepActive } from "@/lib/desktop/inbox";
import worker, { resetForTests } from "../inbox/viochem-inbox.js";

/** Cloudflare's D1 database, as far as the inbox uses it, on top of SQLite. */
function d1() {
  const sqlite = new DatabaseSync(":memory:");
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    run: async () => sqlite.prepare(sql).run(...(args as never[])),
    all: async () => ({ results: sqlite.prepare(sql).all(...(args as never[])) }),
    first: async () => sqlite.prepare(sql).get(...(args as never[])) ?? null,
  });
  return { prepare: (sql: string) => stmt(sql), batch: async (list: ReturnType<typeof stmt>[]) => Promise.all(list.map((s) => s.run())) };
}

const URL_ = "https://viochem-inbox.test.workers.dev";
const KEY = "k".repeat(40);
let env: { DB: ReturnType<typeof d1>; INBOX_KEY: string };
const inbox = (input: string | URL | Request, init?: RequestInit) => worker.fetch(new Request(input, init), env) as Promise<Response>;

/** What a rep's phone does: open the link, fill the form, press Send. */
async function send(link: string, form: Record<string, string | string[]>, lang = "en") {
  const page = await inbox(`${link}?lang=${lang}`);
  const nonce = /name="nonce" value="([^"]+)"/.exec(await page.text())?.[1] ?? "";
  const body = new URLSearchParams({ nonce });
  for (const [k, v] of Object.entries(form)) for (const x of [v].flat()) body.append(k, x);
  return { res: await inbox(`${link}?lang=${lang}`, { method: "POST", body, redirect: "manual" }), body };
}

const dir = mkdtempSync(path.join(tmpdir(), "viochem-inbox-"));
let linalool: number, known: number;

beforeAll(async () => {
  process.env.VIOCHEM_DATA_DIR = dir;
  resetForTests();
  env = { DB: d1(), INBOX_KEY: KEY };
  linalool = (await db.item.create({ data: { code: "INB-LIN", name: "Inbox Linalool", casNumber: "78-70-6" } })).id;
  await db.item.create({ data: { code: "INB-GER", name: "Inbox Geraniol", casNumber: "106-24-1" } });
  known = (await db.customer.create({ data: { name: "Inbox Known Customer" } })).id;
});

afterAll(() => {
  delete process.env.VIOCHEM_DATA_DIR;
  rmSync(dir, { recursive: true, force: true });
});

describe("requests from reps outside the office", () => {
  it("only lets the app in with the right key", async () => {
    expect((await inbox(`${URL_}/api/requests`)).status).toBe(401);
    expect((await inbox(`${URL_}/api/requests`, { headers: { Authorization: "Bearer wrong" } })).status).toBe(401);
    expect((await inbox(`${URL_}/api/ping`, { headers: { Authorization: `Bearer ${KEY}` } })).status).toBe(200);
    setInbox(URL_, "not-the-key-but-long-enough-to-try");
    await expect(checkInbox(inbox)).rejects.toThrow(/refused the key/);
    expect(inboxStatus().error).toMatch(/refused the key/);
  });

  it("shows a rep's form only for an active link, with our names and no prices", async () => {
    setInbox(URL_, KEY);
    const rep = addRep("Karim");
    expect(() => addRep(" karim ")).toThrow(/already a rep/);
    expect((await inbox(`${URL_}/r/${rep.code}`)).status).toBe(404); // The app hasn't sent the list yet.
    await checkInbox(inbox);
    const page = await (await inbox(`${URL_}/r/${rep.code}`)).text();
    expect(page).toContain("Sending as Karim");
    expect(page).toContain('<option value="Inbox Linalool">');
    expect(page).toContain('<option value="Inbox Known Customer">');
    expect(page).not.toMatch(/price|cost|EGP/i);
    expect((await inbox(`${URL_}/r/${"x".repeat(24)}`)).status).toBe(404);
    expect(await (await inbox(`${URL_}/r/${rep.code}?lang=ar`)).text()).toContain('dir="rtl"');
  });

  it("saves what a rep sends as a customer request, once, and empties the inbox", async () => {
    const rep = readConfig().inbox.reps[0];
    const link = `${URL_}/r/${rep.code}`;
    const { res, body } = await send(link, {
      customer: "inbox known customer",
      phone: "0100 123 4567",
      product: ["Inbox Linalool", "106-24-1", "Hedione"],
      qty: ["25", "١٠", "1,500"],
      unit: ["kg", "kg", "g"],
      notes: "Needs it before Sunday",
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toContain("sent=1");
    // Pressing Send twice keeps one request.
    await inbox(`${link}?lang=en`, { method: "POST", body, redirect: "manual" });

    expect(await checkInbox(inbox)).toEqual({ saved: 1 });
    const saved = await db.customerRequest.findFirstOrThrow({ where: { sentBy: "Karim" }, include: { lines: { orderBy: { id: "asc" } } } });
    expect(saved.customerId).toBe(known);
    expect(saved.notes).toBe("Needs it before Sunday\nPhone: 0100 123 4567");
    expect(saved.lines.map((l) => [l.itemId === linalool, l.itemId !== null, l.productName, Number(l.qty), l.unit])).toEqual([
      [true, true, null, 25, "kg"],
      [false, true, null, 10, "kg"], // Typed as a CAS number and linked to our Geraniol.
      [false, false, "Hedione", 1500, "g"],
    ]);
    expect(await checkInbox(inbox)).toEqual({ saved: 0 });
    const left = await inbox(`${URL_}/api/requests`, { headers: { Authorization: `Bearer ${KEY}` } });
    expect((await left.json()).requests).toEqual([]);
    expect(inboxStatus()).toMatchObject({ on: true, error: null, received: 1 });
  });

  it("adds a customer the office doesn't have yet, with their phone", async () => {
    const rep = readConfig().inbox.reps[0];
    await send(`${URL_}/r/${rep.code}`, { customer: "Inbox New Perfumes", phone: "01011112222", product: ["Inbox Linalool"], qty: ["5"], unit: ["kg"] }, "ar");
    expect(await checkInbox(inbox)).toEqual({ saved: 1 });
    const c = await db.customer.findUniqueOrThrow({ where: { name: "Inbox New Perfumes" } });
    expect(c.phone).toBe("01011112222");
    expect(c.notes).toBe("Added from a request by Karim");
  });

  it("sends the form back with the reason when something is missing", async () => {
    const rep = readConfig().inbox.reps[0];
    const { res } = await send(`${URL_}/r/${rep.code}`, { customer: "Someone", product: ["Inbox Linalool"], qty: ["zero"], unit: ["kg"] });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Each quantity must be a number more than 0.");
    expect(html).toContain('value="Someone"');
    expect(await checkInbox(inbox)).toEqual({ saved: 0 });
  });

  it("stops a link that was turned off or replaced", async () => {
    const rep = readConfig().inbox.reps[0];
    setRepActive(rep.id, false);
    await checkInbox(inbox);
    expect((await inbox(`${URL_}/r/${rep.code}`)).status).toBe(404);
    newRepLink(rep.id);
    await checkInbox(inbox);
    const fresh = readConfig().inbox.reps[0];
    expect(fresh.code).not.toBe(rep.code);
    expect((await inbox(`${URL_}/r/${rep.code}`)).status).toBe(404);
    expect((await inbox(`${URL_}/r/${fresh.code}`)).status).toBe(200);
  });
});
