// VIOCHEM request inbox: a Cloudflare Worker with a D1 database bound as DB and a secret INBOX_KEY.
//
// Sales reps outside the office open their personal link (/r/<code>) on any phone and send a
// customer request. It waits here until the VIOCHEM app on the office computer collects it, so the
// app itself is never reachable from the internet. The app also sends up the list of reps, customer
// names and product names (no prices or stock) that the form offers.
//
// What the app calls, with "Authorization: Bearer <INBOX_KEY>":
//   GET  /api/ping              is the inbox set up and the key right
//   PUT  /api/catalog           { reps: [{id, name, code}], customers: [{id, name}], items: [{id, name, unit}] }
//   GET  /api/requests          requests waiting, oldest first
//   POST /api/requests/collected { ids: [...] } removes requests the app has saved

const VERSION = 1;
const MAX_LINES = 30;
const MAX_TEXT = 500;

let ready = false;
async function setup(env) {
  if (ready) return;
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, body TEXT NOT NULL, created_at TEXT NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)"),
  ]);
  ready = true;
}

/** Only for tests, which give each run a fresh database. */
export function resetForTests() {
  ready = false;
}

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

async function catalog(env) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'catalog'").first();
  return row ? JSON.parse(row.value) : { reps: [], customers: [], items: [] };
}

/** Compares two secrets without leaking how much of them matched. */
function sameSecret(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function api(request, env, path) {
  const key = env.INBOX_KEY;
  const given = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!key || key.length < 20) return json({ error: "The inbox has no INBOX_KEY secret yet." }, 503);
  if (!sameSecret(given, key)) return json({ error: "Wrong key." }, 401);

  if (path === "/api/ping" && request.method === "GET") return json({ ok: true, version: VERSION });

  if (path === "/api/catalog" && request.method === "PUT") {
    const body = await request.json();
    const clean = {
      reps: (body.reps ?? []).map((r) => ({ id: Number(r.id), name: String(r.name), code: String(r.code) })).filter((r) => r.code.length >= 16),
      customers: (body.customers ?? []).map((c) => ({ id: Number(c.id), name: String(c.name) })),
      items: (body.items ?? []).map((i) => ({ id: Number(i.id), name: String(i.name), unit: String(i.unit || "kg") })),
    };
    await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('catalog', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(JSON.stringify(clean)).run();
    return json({ ok: true });
  }

  if (path === "/api/requests" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT body FROM requests ORDER BY created_at, id LIMIT 200").all();
    return json({ requests: results.map((r) => JSON.parse(r.body)) });
  }

  if (path === "/api/requests/collected" && request.method === "POST") {
    const ids = ((await request.json()).ids ?? []).map(String);
    if (ids.length) await env.DB.batch(ids.map((id) => env.DB.prepare("DELETE FROM requests WHERE id = ?1").bind(id)));
    return json({ ok: true, removed: ids.length });
  }

  return json({ error: "Not found." }, 404);
}

// ---- The rep's form -------------------------------------------------------------------------

const WORDS = {
  en: {
    title: "Customer request",
    hello: "Sending as {name}",
    customer: "Customer",
    customerHint: "Start typing to pick one of ours, or type a new customer's name.",
    phone: "Customer phone (for a new customer)",
    products: "Products",
    product: "Product",
    productHint: "Pick from our list, or type the name or CAS number",
    qty: "Quantity",
    unit: "Unit",
    addLine: "+ Add another product",
    remove: "Remove",
    notes: "Notes",
    notesHint: "Delivery date, grade, packing, anything the office should know",
    send: "Send to the office",
    sending: "Sending…",
    sent: "Sent. The office will see this request in VIOCHEM within a few minutes.",
    another: "Send another request",
    other: "عربي",
    otherLang: "ar",
    notActive: "This link isn't active. Ask the office for a new one.",
    needCustomer: "Type the customer's name.",
    needProduct: "Add at least one product with a quantity.",
    badQty: "Each quantity must be a number more than 0.",
    tooMany: "Too many products in one request. Send the rest in a second one.",
  },
  ar: {
    title: "طلب عميل",
    hello: "يُرسل باسم {name}",
    customer: "العميل",
    customerHint: "ابدأ الكتابة لاختيار عميل من القائمة، أو اكتب اسم عميل جديد.",
    phone: "تليفون العميل (لعميل جديد)",
    products: "المنتجات",
    product: "المنتج",
    productHint: "اختر من قائمتنا، أو اكتب الاسم أو رقم CAS",
    qty: "الكمية",
    unit: "الوحدة",
    addLine: "+ إضافة منتج آخر",
    remove: "حذف",
    notes: "ملاحظات",
    notesHint: "موعد التسليم، الدرجة، التعبئة، أي شيء يحتاج المكتب معرفته",
    send: "إرسال إلى المكتب",
    sending: "جارٍ الإرسال…",
    sent: "تم الإرسال. سيظهر هذا الطلب في VIOCHEM بالمكتب خلال دقائق.",
    another: "إرسال طلب آخر",
    other: "English",
    otherLang: "en",
    notActive: "هذا الرابط غير مفعّل. اطلب رابطًا جديدًا من المكتب.",
    needCustomer: "اكتب اسم العميل.",
    needProduct: "أضف منتجًا واحدًا على الأقل بكميته.",
    badQty: "كل كمية يجب أن تكون رقمًا أكبر من صفر.",
    tooMany: "عدد المنتجات كبير في طلب واحد. أرسل الباقي في طلب ثانٍ.",
  },
};

const UNITS = ["kg", "g", "L", "mL", "pcs"];

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Arabic and other digits typed on a phone keyboard, and thousands commas, read as a plain number. */
function number(s) {
  const t = String(s ?? "")
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".")
    .replace(/[,٬\s]/g, "");
  return /^\d+(\.\d+)?$/.test(t) ? t : null;
}

function page(lang, body) {
  const w = WORDS[lang];
  return new Response(
    `<!doctype html>
<html lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>VIOCHEM · ${esc(w.title)}</title>
<style>
  :root { color-scheme: light; --brand: #0f766e; --line: #cbd5e1; --muted: #64748b; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 16px/1.45 system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif; background: #f1f5f9; color: #0f172a; }
  header { background: var(--brand); color: #fff; padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; }
  header b { font-size: 18px; letter-spacing: .5px; }
  header a { color: #fff; font-size: 14px; }
  main { max-width: 560px; margin: 0 auto; padding: 16px; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 14px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .muted { color: var(--muted); font-size: 14px; margin: 0; }
  label { display: block; font-weight: 600; font-size: 14px; margin: 12px 0 4px; }
  input, select, textarea { width: 100%; font: inherit; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
  input:focus, select:focus, textarea:focus { outline: 2px solid var(--brand); outline-offset: -1px; }
  .line { border-top: 1px dashed var(--line); padding-top: 10px; margin-top: 12px; }
  .line:first-of-type { border-top: 0; margin-top: 0; padding-top: 0; }
  .row { display: grid; grid-template-columns: 1fr 96px; gap: 8px; }
  .rm { background: none; border: 0; color: #b91c1c; font-size: 14px; padding: 6px 0 0; cursor: pointer; }
  .add { width: 100%; margin-top: 12px; padding: 10px; background: #fff; border: 1px dashed var(--brand); color: var(--brand); border-radius: 8px; font: inherit; font-weight: 600; }
  .send { width: 100%; padding: 14px; background: var(--brand); color: #fff; border: 0; border-radius: 10px; font: inherit; font-weight: 700; font-size: 17px; }
  .send:disabled { opacity: .6; }
  .error { background: #fef2f2; color: #991b1b; border-radius: 8px; padding: 10px 12px; margin-bottom: 14px; }
  .ok { background: #ecfdf5; color: #065f46; border-radius: 12px; padding: 16px; font-weight: 600; }
  .num { direction: ltr; text-align: start; }
</style>
</head>
<body>${body}</body>
</html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer" } },
  );
}

function header(lang, code) {
  const w = WORDS[lang];
  return `<header><b>VIOCHEM</b><a href="/r/${esc(code)}?lang=${w.otherLang}">${w.other}</a></header>`;
}

function lineHtml(w, i, line = {}) {
  return `<div class="line">
  <label for="product_${i}">${esc(w.product)}</label>
  <input id="product_${i}" name="product" list="items" value="${esc(line.name)}" placeholder="${esc(w.productHint)}" autocomplete="off">
  <div class="row">
    <div><label>${esc(w.qty)}</label><input class="num" name="qty" inputmode="decimal" value="${esc(line.qty)}" autocomplete="off"></div>
    <div><label>${esc(w.unit)}</label><select name="unit">${UNITS.map((u) => `<option${u === (line.unit || "kg") ? " selected" : ""}>${u}</option>`).join("")}</select></div>
  </div>
  <button type="button" class="rm" onclick="removeLine(this)">${esc(w.remove)}</button>
</div>`;
}

function form(lang, code, rep, cat, values = {}, error = null) {
  const w = WORDS[lang];
  const lines = values.lines?.length ? values.lines : [{}];
  return page(
    lang,
    `${header(lang, code)}
<main>
  <div class="card"><h1>${esc(w.title)}</h1><p class="muted">${esc(w.hello.replace("{name}", rep.name))}</p></div>
  ${error ? `<div class="error">${esc(error)}</div>` : ""}
  <form method="post" action="/r/${esc(code)}?lang=${lang}" onsubmit="var b=this.querySelector('.send');b.disabled=true;b.textContent='${esc(w.sending)}'">
    <input type="hidden" name="nonce" value="${esc(values.nonce || crypto.randomUUID())}">
    <div class="card">
      <label for="customer">${esc(w.customer)}</label>
      <input id="customer" name="customer" list="customers" value="${esc(values.customer)}" autocomplete="off" required>
      <p class="muted" style="margin-top:4px">${esc(w.customerHint)}</p>
      <label for="phone">${esc(w.phone)}</label>
      <input id="phone" name="phone" type="tel" class="num" value="${esc(values.phone)}" autocomplete="off">
    </div>
    <div class="card">
      <h1 style="font-size:17px">${esc(w.products)}</h1>
      <div id="lines">${lines.map((l, i) => lineHtml(w, i, l)).join("")}</div>
      <button type="button" class="add" onclick="addLine()">${esc(w.addLine)}</button>
    </div>
    <div class="card">
      <label for="notes">${esc(w.notes)}</label>
      <textarea id="notes" name="notes" rows="3" placeholder="${esc(w.notesHint)}">${esc(values.notes)}</textarea>
    </div>
    <button class="send">${esc(w.send)}</button>
  </form>
  <datalist id="customers">${cat.customers.map((c) => `<option value="${esc(c.name)}">`).join("")}</datalist>
  <datalist id="items">${cat.items.map((i) => `<option value="${esc(i.name)}">`).join("")}</datalist>
</main>
<template id="blank">${lineHtml(w, "N")}</template>
<script>
  var n = ${lines.length};
  function addLine() {
    var html = document.getElementById("blank").innerHTML.replace(/_N/g, "_" + n++);
    document.getElementById("lines").insertAdjacentHTML("beforeend", html);
    var inputs = document.querySelectorAll("#lines input[name=product]");
    inputs[inputs.length - 1].focus();
  }
  function removeLine(btn) {
    var all = document.querySelectorAll("#lines .line");
    var line = btn.closest(".line");
    if (all.length > 1) line.remove();
    else line.querySelectorAll("input").forEach(function (i) { i.value = ""; });
  }
</script>`,
  );
}

function notActive(lang) {
  const w = WORDS[lang];
  return new Response(page(lang, `<header><b>VIOCHEM</b></header><main><div class="card"><p>${esc(w.notActive)}</p></div></main>`).body, {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

const findByName = (list, name) => list.find((x) => x.name.toLocaleLowerCase() === name.toLocaleLowerCase()) ?? null;
const clip = (s) => String(s ?? "").trim().slice(0, MAX_TEXT);

async function submit(request, env, lang, code, rep, cat) {
  const w = WORDS[lang];
  const fd = await request.formData();
  const products = fd.getAll("product").map(clip);
  const qtys = fd.getAll("qty").map((q) => String(q ?? "").trim());
  const units = fd.getAll("unit").map(String);
  const values = {
    nonce: clip(fd.get("nonce")).slice(0, 64),
    customer: clip(fd.get("customer")),
    phone: clip(fd.get("phone")).slice(0, 40),
    notes: clip(fd.get("notes")),
    lines: products.map((name, i) => ({ name, qty: qtys[i] ?? "", unit: UNITS.includes(units[i]) ? units[i] : "kg" })).filter((l) => l.name || l.qty),
  };
  const again = (error) => form(lang, code, rep, cat, values, error);
  if (!values.customer) return again(w.needCustomer);
  if (!values.lines.length || values.lines.some((l) => !l.name)) return again(w.needProduct);
  if (values.lines.length > MAX_LINES) return again(w.tooMany);
  const lines = [];
  for (const l of values.lines) {
    const qty = number(l.qty);
    if (!qty || !(Number(qty) > 0)) return again(w.badQty);
    const item = findByName(cat.items, l.name);
    lines.push({ itemId: item?.id ?? null, name: l.name, qty, unit: item?.unit ?? l.unit });
  }
  const customer = findByName(cat.customers, values.customer);
  // The nonce is made when the form is opened, so pressing Send twice keeps one request.
  const id = /^[\w-]{8,64}$/.test(values.nonce) ? values.nonce : crypto.randomUUID();
  const now = new Date().toISOString();
  const body = {
    id,
    rep: { id: rep.id, name: rep.name },
    customerId: customer?.id ?? null,
    customerName: customer?.name ?? values.customer,
    phone: values.phone || null,
    notes: values.notes || null,
    lines,
    sentAt: now,
  };
  await env.DB.prepare("INSERT INTO requests (id, body, created_at) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO NOTHING").bind(id, JSON.stringify(body), now).run();
  return Response.redirect(new URL(`/r/${code}?lang=${lang}&sent=1`, request.url).toString(), 303);
}

const inbox = {
  async fetch(request, env) {
    await setup(env);
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path.startsWith("/api/")) return api(request, env, path);

    const m = /^\/r\/([\w-]{16,64})$/.exec(path);
    const lang = url.searchParams.get("lang") === "ar" || (!url.searchParams.get("lang") && /^ar\b/i.test(request.headers.get("Accept-Language") ?? "")) ? "ar" : "en";
    if (!m) return notActive(lang);
    const code = m[1];
    const cat = await catalog(env);
    const rep = cat.reps.find((r) => sameSecret(r.code, code));
    if (!rep) return notActive(lang);

    if (request.method === "POST") return submit(request, env, lang, code, rep, cat);
    if (url.searchParams.get("sent")) {
      const w = WORDS[lang];
      return page(lang, `${header(lang, code)}<main><div class="ok">✓ ${esc(w.sent)}</div><p><a class="add" style="display:block;text-align:center;text-decoration:none" href="/r/${esc(code)}?lang=${lang}">${esc(w.another)}</a></p></main>`);
    }
    return form(lang, code, rep, cat);
  },
};

export default inbox;
