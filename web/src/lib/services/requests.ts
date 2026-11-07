import Decimal from "decimal.js";
import type { InvoiceKind } from "@prisma/client";
import { db, sameName } from "@/lib/db";
import { today } from "@/lib/dates";
import { normalizeCas } from "@/lib/chemistry";
import { UserError } from "./errors";
import { nextNumber } from "./numbering";
import { onOrder } from "./orders";
import { priceHints } from "./price-history";
import { createQuote } from "./quotes";
import { availability, NOTHING } from "./reservations";

/**
 * Customer requests: what customers asked for, written down before a price is offered.
 * Sending one on puts what is free in stock onto a quotation and records the rest as the
 * supply gap: our own products we were short of, and products we don't import at all.
 */

const dec = (v: { toString(): string } | null | undefined) => new Decimal(v?.toString() ?? 0);
const ZERO = new Decimal(0);

export type RequestLineInput = { itemId: number | null; productName: string | null; casNumber: string | null; unit: string | null; qty: string; notes?: string | null };

async function open(id: number) {
  const r = await db.customerRequest.findUniqueOrThrow({ where: { id } });
  if (r.status !== "OPEN") throw new UserError("Only open requests can be changed.");
  return r;
}

/**
 * A product typed in by name whose CAS number or name matches one of ours is linked to it, so it
 * is checked against stock like any other.
 */
async function resolve(line: RequestLineInput) {
  const qty = new Decimal(line.qty);
  if (!qty.gt(0)) throw new UserError("Quantity must be more than 0.");
  if (line.itemId) return { itemId: line.itemId, productName: null, casNumber: null, unit: null, qty: qty.toString(), notes: line.notes ?? null };
  const name = line.productName?.trim() || null;
  const cas = line.casNumber?.trim() ? normalizeCas(line.casNumber) : null;
  if (!name && !cas) throw new UserError("Choose a product, or type the name of one we don't import.");
  const ours =
    (cas ? await db.item.findFirst({ where: { casNumber: cas, active: true } }) : null) ??
    (name ? (await db.item.findMany({ where: { active: true }, select: { id: true, name: true } })).find((i) => sameName(i.name, name)) : null);
  if (ours) return { itemId: ours.id, productName: null, casNumber: null, unit: null, qty: qty.toString(), notes: line.notes ?? null };
  return { itemId: null, productName: name ?? cas, casNumber: cas, unit: line.unit?.trim() || "kg", qty: qty.toString(), notes: line.notes ?? null };
}

export async function createRequest(customerId: number, date: Date, lines: RequestLineInput[] = [], notes: string | null = null) {
  const data = await Promise.all(lines.map(resolve));
  return db.$transaction(async (tx) =>
    tx.customerRequest.create({
      data: {
        number: await nextNumber(tx, "REQ", date),
        customerId,
        date,
        notes,
        lines: { create: data.map(({ unit, ...l }) => ({ ...l, ...(unit ? { unit } : {}) })) },
      },
    }),
  );
}

export async function updateRequest(id: number, data: { customerId: number; date: Date; notes: string | null }) {
  await open(id);
  return db.customerRequest.update({ where: { id }, data });
}

export async function addRequestLines(id: number, lines: RequestLineInput[]) {
  await open(id);
  if (!lines.length) throw new UserError("Add at least one product.");
  const data = await Promise.all(lines.map(resolve));
  await db.customerRequestLine.createMany({ data: data.map(({ unit, ...l }) => ({ ...l, requestId: id, ...(unit ? { unit } : {}) })) });
}

export async function updateRequestLine(id: number, lineId: number, qty: string) {
  await open(id);
  if (!new Decimal(qty).gt(0)) throw new UserError("Quantity must be more than 0.");
  await db.customerRequestLine.update({ where: { id: lineId, requestId: id }, data: { qty } });
}

export async function removeRequestLine(id: number, lineId: number) {
  await open(id);
  await db.customerRequestLine.delete({ where: { id: lineId, requestId: id } });
}

export async function cancelRequest(id: number) {
  const { count } = await db.customerRequest.updateMany({ where: { id, status: "OPEN" }, data: { status: "CANCELLED" } });
  if (count !== 1) throw new UserError("Only open requests can be changed.");
}

export async function reopenRequest(id: number) {
  const { count } = await db.customerRequest.updateMany({ where: { id, status: "CANCELLED" }, data: { status: "OPEN" } });
  if (count !== 1) throw new UserError("Only cancelled requests can be reopened.");
}

export async function deleteRequest(id: number) {
  await open(id);
  await db.customerRequest.delete({ where: { id } });
}

export type LinePlan = { lineId: number; kind: "stock" | "partial" | "none" | "not-ours"; quote: Decimal; gap: Decimal; free: Decimal };

/**
 * How each line would be sent on: the part free in stock goes onto the quotation, the rest to the
 * supply gap. Free stock is shared out in the order the lines were added, so asking for the same
 * product twice can't promise it twice.
 */
export async function planRequest(lines: { id: number; itemId: number | null; qty: { toString(): string } }[], on: Date = today()): Promise<LinePlan[]> {
  const ids = [...new Set(lines.flatMap((l) => (l.itemId ? [l.itemId] : [])))];
  const free = ids.length ? await availability(ids, {}, on) : new Map();
  const left = new Map(ids.map((id) => [id, Decimal.max((free.get(id) ?? NOTHING).free, 0)]));
  return lines.map((l) => {
    const want = dec(l.qty);
    if (!l.itemId) return { lineId: l.id, kind: "not-ours", quote: ZERO, gap: want, free: ZERO };
    const avail = left.get(l.itemId) ?? ZERO;
    const quote = Decimal.min(avail, want);
    left.set(l.itemId, avail.minus(quote));
    const gap = want.minus(quote);
    return { lineId: l.id, kind: gap.isZero() ? "stock" : quote.isZero() ? "none" : "partial", quote, gap, free: avail };
  });
}

/**
 * Send the request on. What is free in stock goes onto a new open quotation, priced at what this
 * customer last paid (or empty, to be filled in). Whatever is short, and every product we don't
 * import, is kept as the supply gap. With nothing in stock no quotation is made.
 */
export async function convertRequest(id: number, kind: InvoiceKind = "TAXED", on: Date = today()) {
  const r = await open(id);
  const lines = await db.customerRequestLine.findMany({ where: { requestId: id }, orderBy: { id: "asc" } });
  if (!lines.length) throw new UserError("Add products to the request before sending it on.");
  const plan = await planRequest(lines, on);
  const toQuote = plan.filter((p) => p.quote.gt(0));
  const itemOf = new Map(lines.map((l) => [l.id, l.itemId]));
  const hints = toQuote.length ? await priceHints([...new Set(toQuote.map((p) => itemOf.get(p.lineId)!))], r.customerId, on) : new Map();

  return db.$transaction(async (tx) => {
    const { count } = await tx.customerRequest.updateMany({ where: { id, status: "OPEN" }, data: { status: "CONVERTED", convertedAt: new Date() } });
    if (count !== 1) throw new UserError("Only open requests can be changed.");
    let quoteId: number | null = null;
    if (toQuote.length) {
      const q = await createQuote(r.customerId, on, null, kind, tx);
      quoteId = q.id;
      await tx.quoteLine.createMany({
        data: toQuote.map((p) => {
          const itemId = itemOf.get(p.lineId)!;
          return { quoteId: q.id, itemId, qty: p.quote.toString(), unitPrice: hints.get(itemId)?.lastToCustomer[0]?.price ?? "0" };
        }),
      });
      await tx.quote.update({ where: { id: q.id }, data: { notes: r.notes } });
      await tx.customerRequest.update({ where: { id }, data: { quoteId } });
    }
    for (const p of plan) await tx.customerRequestLine.update({ where: { id: p.lineId }, data: { quotedQty: p.quote.toString(), gapQty: p.gap.toString() } });
    return { quoteId, quoted: toQuote.length, gaps: plan.filter((p) => p.gap.gt(0)).length };
  });
}

export type GapRequest = { lineId: number; requestId: number; number: string; customer: string; customerId: number; date: Date; qty: Decimal; closed: boolean };
export type GapRow = {
  key: string;
  itemId: number | null;
  code: string | null;
  name: string;
  cas: string | null;
  unit: string;
  qty: Decimal;
  customers: string[];
  requests: GapRequest[];
  lastAsked: Date;
  /** Our products only: free in stock now, and already ordered or on the way. */
  free?: Decimal;
  coming?: Decimal;
};

/** A product we don't import is the same one when its CAS number is, or else its name. */
export const gapKey = (l: { itemId: number | null; productName: string | null; casNumber: string | null }) =>
  l.itemId ? `item:${l.itemId}` : l.casNumber ? `cas:${l.casNumber}` : `name:${(l.productName ?? "").trim().toLowerCase().replace(/\s+/g, " ")}`;

/**
 * The supply gap: what customers asked for that we couldn't offer, added up by product, most asked
 * first. "ours" are our products we were short of; "local" are products we don't import, bought
 * from local distributors. Open gaps only, unless handled ones are asked for.
 */
export async function supplyGap(opts: { since?: Date | null; handled?: boolean } = {}) {
  const lines = await db.customerRequestLine.findMany({
    where: {
      gapQty: { gt: 0 },
      gapClosedAt: opts.handled ? { not: null } : null,
      request: { status: "CONVERTED", ...(opts.since ? { date: { gte: opts.since } } : {}) },
    },
    include: { item: true, request: { include: { customer: true } } },
    orderBy: [{ request: { date: "desc" } }, { id: "desc" }],
  });
  const groups = new Map<string, GapRow>();
  for (const l of lines) {
    const key = gapKey(l);
    const g = groups.get(key) ?? {
      key,
      itemId: l.itemId,
      code: l.item?.code ?? null,
      name: l.item?.name ?? l.productName ?? "",
      cas: l.item?.casNumber ?? l.casNumber,
      unit: l.item?.unit ?? l.unit,
      qty: ZERO,
      customers: [],
      requests: [],
      lastAsked: l.request.date,
    };
    g.qty = g.qty.plus(dec(l.gapQty));
    if (!g.customers.includes(l.request.customer.name)) g.customers.push(l.request.customer.name);
    g.requests.push({ lineId: l.id, requestId: l.requestId, number: l.request.number, customer: l.request.customer.name, customerId: l.request.customerId, date: l.request.date, qty: dec(l.gapQty), closed: l.gapClosedAt !== null });
    if (l.request.date > g.lastAsked) g.lastAsked = l.request.date;
    groups.set(key, g);
  }
  const rows = [...groups.values()].sort((a, b) => b.requests.length - a.requests.length || b.qty.comparedTo(a.qty) || a.name.localeCompare(b.name));
  const ours = rows.filter((r) => r.itemId);
  if (ours.length) {
    const ids = ours.map((r) => r.itemId!);
    const [free, coming] = await Promise.all([availability(ids), onOrder()]);
    for (const r of ours) {
      r.free = Decimal.max((free.get(r.itemId!) ?? NOTHING).free, 0);
      r.coming = coming.get(r.itemId!) ?? ZERO;
    }
  }
  return { ours, local: rows.filter((r) => !r.itemId) };
}

/** What still needs buying for one of our products: what was missing, less what is free now or already coming. */
export const stillToBuy = (r: GapRow) => Decimal.max(r.qty.minus(r.free ?? 0).minus(r.coming ?? 0), 0);

/** Mark a product's open gap lines as dealt with (ordered, bought locally or let go), or open them again. */
export async function setGapHandled(lineIds: number[], handled: boolean) {
  if (!lineIds.length) return;
  await db.customerRequestLine.updateMany({
    where: { id: { in: lineIds }, gapQty: { gt: 0 }, gapClosedAt: handled ? null : { not: null } },
    data: { gapClosedAt: handled ? new Date() : null },
  });
}
