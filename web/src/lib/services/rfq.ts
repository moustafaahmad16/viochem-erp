import Decimal from "decimal.js";
import { db, type Tx } from "@/lib/db";
import { addDays, today } from "@/lib/dates";
import type { Reply } from "@/lib/rfq/sheet";
import { UserError } from "./errors";
import { nextNumber } from "./numbering";

/**
 * Requests for quotation. The materials needed go to several suppliers on an Excel sheet;
 * their prices come back on the same sheet, and each line's offers are compared at what
 * they would really cost landed in Egypt, so the choice is more than the lowest price.
 */

const dec = (v: { toString(): string } | null | undefined) => new Decimal(v == null ? 0 : v.toString());
const ZERO = new Decimal(0);

/** What a month of supplier credit is worth: Egyptian borrowing costs about 25% a year. */
export const MONEY_COST_PER_YEAR = 0.25;
/** Extra counted against an offer that would arrive after the date the goods are needed. */
export const LATE_PENALTY = 0.1;
/** Extra counted per day a supplier's shipments are usually late, up to 30 days. */
export const DELAY_PENALTY_PER_DAY = 0.002;

async function load(tx: Tx, id: number) {
  const rfq = await tx.rfq.findUnique({ where: { id } });
  if (!rfq) throw new UserError("That request for quotation no longer exists.");
  return rfq;
}

async function openRfq(tx: Tx, id: number) {
  const rfq = await load(tx, id);
  if (rfq.status !== "OPEN") throw new UserError("Only open requests can be changed.");
  return rfq;
}

function checkDates(date: Date, replyBy: Date | null, neededBy: Date | null) {
  if (replyBy && replyBy < date) throw new UserError("The reply date can't be before the request date.");
  if (neededBy && neededBy < date) throw new UserError("The date needed can't be before the request date.");
}

export async function createRfq(input: { date: Date; replyBy: Date | null; neededBy: Date | null; notes: string | null; lines?: { itemId: number; qty: Decimal.Value }[] }) {
  checkDates(input.date, input.replyBy, input.neededBy);
  return db.$transaction(async (tx) =>
    tx.rfq.create({
      data: {
        number: await nextNumber(tx, "RFQ", input.date),
        date: input.date,
        replyBy: input.replyBy,
        neededBy: input.neededBy,
        notes: input.notes,
        lines: { create: (input.lines ?? []).filter((l) => new Decimal(l.qty).gt(0)).map((l) => ({ itemId: l.itemId, qty: l.qty.toString() })) },
      },
    }),
  );
}

export async function updateRfq(id: number, input: { date: Date; replyBy: Date | null; neededBy: Date | null; notes: string | null }) {
  checkDates(input.date, input.replyBy, input.neededBy);
  return db.$transaction(async (tx) => {
    await openRfq(tx, id);
    return tx.rfq.update({ where: { id }, data: input });
  });
}

export async function addRfqLine(id: number, input: { itemId: number; qty: Decimal.Value; notes: string | null }) {
  if (new Decimal(input.qty).lte(0)) throw new UserError("Quantity must be more than zero.");
  return db.$transaction(async (tx) => {
    await openRfq(tx, id);
    if (await tx.rfqLine.count({ where: { rfqId: id, itemId: input.itemId } })) throw new UserError("That product is already on this request. Change its quantity instead.");
    return tx.rfqLine.create({ data: { rfqId: id, itemId: input.itemId, qty: input.qty.toString(), notes: input.notes } });
  });
}

export async function updateRfqLine(id: number, lineId: number, input: { qty: Decimal.Value; notes: string | null }) {
  if (new Decimal(input.qty).lte(0)) throw new UserError("Quantity must be more than zero.");
  return db.$transaction(async (tx) => {
    await openRfq(tx, id);
    const line = await tx.rfqLine.findUnique({ where: { id: lineId } });
    if (!line || line.rfqId !== id) throw new UserError("That line isn't on this request.");
    await tx.rfqLine.update({ where: { id: lineId }, data: { qty: input.qty.toString(), notes: input.notes } });
    // A chosen quantity follows the new need unless the supplier's minimum is higher.
    const chosen = await tx.rfqQuote.findMany({ where: { rfqLineId: lineId, awardQty: { not: null } } });
    for (const q of chosen) await tx.rfqQuote.update({ where: { id: q.id }, data: { awardQty: Decimal.max(new Decimal(input.qty), dec(q.moq)).toString() } });
  });
}

export async function removeRfqLine(id: number, lineId: number) {
  return db.$transaction(async (tx) => {
    await openRfq(tx, id);
    await tx.rfqLine.deleteMany({ where: { id: lineId, rfqId: id } });
  });
}

/** Set the products and quantities in one go: the list on screen replaces what was saved. */
export async function saveLines(id: number, lines: { itemId: number; qty: Decimal.Value }[]) {
  const seen = new Set<number>();
  for (const l of lines) {
    if (new Decimal(l.qty).lte(0)) throw new UserError("Quantity must be more than zero.");
    if (seen.has(l.itemId)) throw new UserError("A product is listed twice. Put the total quantity on one line.");
    seen.add(l.itemId);
  }
  if (!lines.length) throw new UserError("Add at least one product.");
  return db.$transaction(async (tx) => {
    await openRfq(tx, id);
    const saved = await tx.rfqLine.findMany({ where: { rfqId: id } });
    await tx.rfqLine.deleteMany({ where: { rfqId: id, itemId: { notIn: lines.map((l) => l.itemId) } } });
    for (const l of lines) {
      const line = saved.find((x) => x.itemId === l.itemId);
      if (line) {
        if (!dec(line.qty).eq(l.qty)) {
          await tx.rfqLine.update({ where: { id: line.id }, data: { qty: l.qty.toString() } });
          const chosen = await tx.rfqQuote.findMany({ where: { rfqLineId: line.id, awardQty: { not: null } } });
          for (const q of chosen) await tx.rfqQuote.update({ where: { id: q.id }, data: { awardQty: Decimal.max(new Decimal(l.qty), dec(q.moq)).toString() } });
        }
      } else {
        await tx.rfqLine.create({ data: { rfqId: id, itemId: l.itemId, qty: l.qty.toString() } });
      }
    }
  });
}

export async function inviteSupplier(id: number, supplierId: number) {
  return db.$transaction(async (tx) => {
    await openRfq(tx, id);
    await tx.rfqSupplier.upsert({ where: { rfqId_supplierId: { rfqId: id, supplierId } }, create: { rfqId: id, supplierId }, update: {} });
  });
}

/** Take a supplier off the request, with any prices they sent. */
export async function removeSupplier(id: number, supplierId: number) {
  return db.$transaction(async (tx) => {
    await openRfq(tx, id);
    await tx.rfqQuote.deleteMany({ where: { rfqId: id, supplierId } });
    await tx.rfqSupplier.deleteMany({ where: { rfqId: id, supplierId } });
  });
}

export async function markSent(id: number, supplierId: number) {
  await db.rfqSupplier.updateMany({ where: { rfqId: id, supplierId, sentAt: null }, data: { sentAt: new Date() } });
}

export type QuoteInput = {
  lineId: number;
  supplierId: number;
  currency: string;
  unitPrice: Decimal.Value;
  moq?: Decimal.Value | null;
  leadTimeDays?: number | null;
  paymentTermsDays?: number | null;
  validUntil?: Date | null;
  incoterm?: string | null;
  notes?: string | null;
};

async function upsertQuote(tx: Tx, rfqId: number, q: QuoteInput) {
  const currency = q.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new UserError(`Currency "${q.currency}" should be three letters, like USD.`);
  if (new Decimal(q.unitPrice).lte(0)) throw new UserError("Price must be more than zero.");
  const data = {
    currency,
    unitPrice: q.unitPrice.toString(),
    moq: q.moq == null ? null : q.moq.toString(),
    leadTimeDays: q.leadTimeDays ?? null,
    paymentTermsDays: q.paymentTermsDays ?? null,
    validUntil: q.validUntil ?? null,
    incoterm: q.incoterm || null,
    notes: q.notes || null,
  };
  await tx.rfqQuote.upsert({
    where: { rfqLineId_supplierId: { rfqLineId: q.lineId, supplierId: q.supplierId } },
    create: { rfqId, rfqLineId: q.lineId, supplierId: q.supplierId, ...data },
    update: data,
  });
}

/** Enter or correct one supplier's price for one line by hand. */
export async function saveQuote(id: number, q: QuoteInput) {
  return db.$transaction(async (tx) => {
    await openRfq(tx, id);
    const line = await tx.rfqLine.findUnique({ where: { id: q.lineId } });
    if (!line || line.rfqId !== id) throw new UserError("That product isn't on this request.");
    await tx.rfqSupplier.upsert({ where: { rfqId_supplierId: { rfqId: id, supplierId: q.supplierId } }, create: { rfqId: id, supplierId: q.supplierId, repliedAt: new Date() }, update: { repliedAt: new Date() } });
    await upsertQuote(tx, id, q);
  });
}

export async function deleteQuote(id: number, quoteId: number) {
  return db.$transaction(async (tx) => {
    await openRfq(tx, id);
    await tx.rfqQuote.deleteMany({ where: { id: quoteId, rfqId: id } });
  });
}

/**
 * Load a supplier's reply sheet. The supplier is the one chosen, else the name written on the sheet,
 * matched to an existing supplier or added as a new one. Their earlier prices on this request are
 * replaced by the sheet, so sending a corrected sheet is safe. Rows with no price remove that offer.
 */
export async function loadReply(id: number, supplierId: number | null, reply: Reply) {
  if (reply.rfqId !== null && reply.rfqId !== id) throw new UserError(`This sheet is for ${reply.number ?? "another request"}, not this one.`);
  if (reply.errors.length) {
    throw new UserError(`Nothing was loaded. Fix these and upload again:\n${reply.errors.map((e) => `Row ${e.row}: ${e.message}`).join("\n")}`);
  }
  return db.$transaction(async (tx) => {
    const rfq = await openRfq(tx, id);
    let supplier = supplierId ?? reply.supplierId ? await tx.supplier.findUnique({ where: { id: (supplierId ?? reply.supplierId)! } }) : null;
    const name = reply.supplierName?.trim();
    if (!supplier && name) {
      const firstCurrency = reply.rows.find((r) => r.unitPrice && r.currency)?.currency;
      supplier =
        (await tx.supplier.findFirst({ where: { name: { equals: name, mode: "insensitive" } } })) ??
        (await tx.supplier.create({ data: { name, currency: firstCurrency && /^[A-Z]{3}$/.test(firstCurrency) ? firstCurrency : "USD" } }));
    }
    if (!supplier) throw new UserError("The supplier's name isn't on the sheet. Choose who sent it.");
    const who = supplier.id;
    const lines = new Set((await tx.rfqLine.findMany({ where: { rfqId: id }, select: { id: true } })).map((l) => l.id));
    let priced = 0;
    const swapped: Date[] = [];
    for (const r of reply.rows) {
      const fixed = r.validUntil && dayMonthSwapped(r.validUntil, rfq.date);
      if (fixed) {
        swapped.push(fixed);
        r.validUntil = fixed;
      }
      if (!lines.has(r.lineId)) continue; // a product taken off the request since the sheet was sent
      if (!r.unitPrice || new Decimal(r.unitPrice).isZero()) {
        await tx.rfqQuote.deleteMany({ where: { rfqLineId: r.lineId, supplierId: who } });
        continue;
      }
      try {
        await upsertQuote(tx, id, { ...r, supplierId: who, currency: r.currency ?? supplier.currency, unitPrice: r.unitPrice });
      } catch (e) {
        throw e instanceof UserError ? new UserError(`Row ${r.row}: ${e.message}`) : e;
      }
      priced++;
    }
    await tx.rfqSupplier.upsert({ where: { rfqId_supplierId: { rfqId: id, supplierId: who } }, create: { rfqId: id, supplierId: who, repliedAt: new Date() }, update: { repliedAt: new Date() } });
    return { supplier: supplier.name, priced, swapped };
  });
}

/**
 * A "valid until" date before the request was even sent is almost always a day and month swapped
 * by Excel (1/11/2026 typed as 1 November, saved as 11 January). Read it the other way round when
 * that gives a date on or after the request.
 */
export function dayMonthSwapped(d: Date, rfqDate: Date): Date | null {
  if (d >= rfqDate || d.getUTCDate() > 12) return null;
  const other = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCDate() - 1, d.getUTCMonth() + 1));
  return other >= rfqDate ? other : null;
}

export async function setRate(id: number, currency: string, rate: Decimal.Value) {
  if (new Decimal(rate).lte(0)) throw new UserError("The exchange rate must be more than zero.");
  const c = currency.toUpperCase();
  await db.rfqRate.upsert({ where: { rfqId_currency: { rfqId: id, currency: c } }, create: { rfqId: id, currency: c, rate: rate.toString() }, update: { rate: rate.toString() } });
}

/** Buy a line from this offer: the quantity needed, or the supplier's minimum if that is more. */
export async function chooseQuote(id: number, quoteId: number) {
  return db.$transaction(async (tx) => {
    await openRfq(tx, id);
    const q = await tx.rfqQuote.findUnique({ where: { id: quoteId }, include: { line: true } });
    if (!q || q.rfqId !== id) throw new UserError("That offer isn't on this request.");
    await tx.rfqQuote.updateMany({ where: { rfqLineId: q.rfqLineId }, data: { awardQty: null } });
    await tx.rfqQuote.update({ where: { id: quoteId }, data: { awardQty: Decimal.max(dec(q.line.qty), dec(q.moq)).toString() } });
  });
}

export async function unchooseLine(id: number, lineId: number) {
  return db.$transaction(async (tx) => {
    await openRfq(tx, id);
    await tx.rfqQuote.updateMany({ where: { rfqId: id, rfqLineId: lineId }, data: { awardQty: null } });
  });
}

/** Take the suggestion on every line that has one. */
export async function chooseSuggested(id: number) {
  const analysis = await analyseRfq(id);
  for (const line of analysis.lines) if (line.best) await chooseQuote(id, line.best.quoteId);
}

/** Order what is chosen, taking the suggestion on any product not chosen by hand. */
export async function orderSuggested(id: number) {
  const analysis = await analyseRfq(id);
  for (const line of analysis.lines) if (!line.chosen && line.best) await chooseQuote(id, line.best.quoteId);
  return makeOrders(id);
}

/** One purchase order per supplier and currency for the chosen offers, then the request is done. */
export async function makeOrders(id: number) {
  return db.$transaction(async (tx) => {
    const rfq = await openRfq(tx, id);
    const chosen = await tx.rfqQuote.findMany({ where: { rfqId: id, awardQty: { not: null } }, include: { line: true, supplier: true }, orderBy: { id: "asc" } });
    if (!chosen.length) throw new UserError("Choose a supplier for at least one product first.");
    const date = today();
    const groups = new Map<string, typeof chosen>();
    for (const q of chosen) groups.set(`${q.supplierId}-${q.currency}`, [...(groups.get(`${q.supplierId}-${q.currency}`) ?? []), q]);
    const orders: { id: number; number: string }[] = [];
    for (const quotes of groups.values()) {
      const lead = Math.max(0, ...quotes.map((q) => q.leadTimeDays ?? 0));
      const order = await tx.purchaseOrder.create({
        data: {
          number: await nextNumber(tx, "PO", date),
          supplierId: quotes[0].supplierId,
          date,
          expectedDate: lead ? addDays(date, lead) : rfq.neededBy,
          currency: quotes[0].currency,
          notes: [`From ${rfq.number}.`, ...new Set(quotes.map((q) => q.incoterm).filter(Boolean).map((i) => `Incoterm: ${i}.`))].join(" "),
          lines: { create: quotes.map((q) => ({ itemId: q.line.itemId, qty: q.awardQty!, unitPrice: q.unitPrice })) },
        },
      });
      await tx.rfqQuote.updateMany({ where: { id: { in: quotes.map((q) => q.id) } }, data: { purchaseOrderId: order.id } });
      orders.push({ id: order.id, number: order.number });
    }
    await tx.rfq.update({ where: { id }, data: { status: "ORDERED" } });
    return orders;
  });
}

export async function cancelRfq(id: number) {
  return db.$transaction(async (tx) => {
    await openRfq(tx, id);
    await tx.rfq.update({ where: { id }, data: { status: "CANCELLED" } });
  });
}

export async function reopenRfq(id: number) {
  return db.$transaction(async (tx) => {
    const rfq = await load(tx, id);
    if (rfq.status !== "CANCELLED") throw new UserError("Only a cancelled request can be reopened. Orders already made stay as they are.");
    await tx.rfq.update({ where: { id }, data: { status: "OPEN" } });
  });
}

export async function deleteRfq(id: number) {
  return db.$transaction(async (tx) => {
    const rfq = await load(tx, id);
    if (rfq.status === "ORDERED") throw new UserError("Purchase orders were made from this request, so it can't be deleted.");
    await tx.rfq.delete({ where: { id } });
  });
}

// ---------------------------------------------------------------------------------------------
// Analysis

export type SupplierRecord = {
  /** Landed cost ÷ price paid in EGP on received shipments: freight, duty and charges on top. */
  landedFactor: Decimal | null;
  shipments: number;
  /** Average days late against the expected arrival, and the share that arrived on time. */
  avgDaysLate: number | null;
  onTimePct: number | null;
  /** Average days from order to arrival. */
  avgLeadDays: number | null;
};

/** What past shipments say about each supplier, from goods actually received. */
export async function supplierRecords(): Promise<{ bySupplier: Map<number, SupplierRecord>; overallFactor: Decimal | null }> {
  const shipments = await db.shipment.findMany({ where: { status: "RECEIVED" }, include: { lines: { include: { lot: true } } } });
  const acc = new Map<number, { paid: Decimal; landed: Decimal; n: number; late: number[]; lead: number[] }>();
  let paidAll = ZERO;
  let landedAll = ZERO;
  for (const s of shipments) {
    const a = acc.get(s.supplierId) ?? { paid: ZERO, landed: ZERO, n: 0, late: [], lead: [] };
    for (const l of s.lines) {
      if (!l.lot) continue;
      const paid = dec(l.qty).times(dec(l.unitPrice)).times(dec(s.fxRate));
      const landed = dec(l.qty).times(dec(l.lot.unitCostEgp));
      a.paid = a.paid.plus(paid);
      a.landed = a.landed.plus(landed);
      paidAll = paidAll.plus(paid);
      landedAll = landedAll.plus(landed);
    }
    a.n++;
    if (s.arrivalDate && s.eta) a.late.push(Math.max(0, Math.round((s.arrivalDate.getTime() - s.eta.getTime()) / 86_400_000)));
    if (s.arrivalDate) a.lead.push(Math.round((s.arrivalDate.getTime() - s.orderDate.getTime()) / 86_400_000));
    acc.set(s.supplierId, a);
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const bySupplier = new Map<number, SupplierRecord>();
  for (const [id, a] of acc) {
    bySupplier.set(id, {
      landedFactor: a.paid.gt(0) ? a.landed.div(a.paid) : null,
      shipments: a.n,
      avgDaysLate: avg(a.late),
      onTimePct: a.late.length ? (a.late.filter((d) => d === 0).length / a.late.length) * 100 : null,
      avgLeadDays: avg(a.lead),
    });
  }
  return { bySupplier, overallFactor: paidAll.gt(0) ? landedAll.div(paidAll) : null };
}

/** The latest exchange rate used on a shipment in each currency, as a starting point. */
export async function latestRates(): Promise<Map<string, Decimal>> {
  const rows = await db.shipment.findMany({ orderBy: [{ orderDate: "desc" }, { id: "desc" }], select: { currency: true, fxRate: true } });
  const rates = new Map<string, Decimal>([["EGP", new Decimal(1)]]);
  for (const r of rows) if (!rates.has(r.currency)) rates.set(r.currency, dec(r.fxRate));
  return rates;
}

export type Flag =
  | { kind: "expired"; date: Date }
  | { kind: "noRate"; currency: string }
  | { kind: "moq"; moq: Decimal }
  | { kind: "late"; arrives: Date }
  | { kind: "credit"; days: number; saving: Decimal }
  | { kind: "slow"; days: number }
  | { kind: "newSupplier" };

export type Option = {
  quoteId: number;
  supplierId: number;
  supplierName: string;
  currency: string;
  unitPrice: Decimal;
  moq: Decimal | null;
  leadTimeDays: number | null;
  paymentTermsDays: number | null;
  validUntil: Date | null;
  incoterm: string | null;
  notes: string | null;
  awardQty: Decimal | null;
  purchaseOrderId: number | null;
  /** Price in EGP, then with freight, duty and charges as this supplier's shipments usually add. */
  priceEgp: Decimal | null;
  landedUnit: Decimal | null;
  factor: Decimal;
  factorFrom: "supplier" | "average" | "none";
  buyQty: Decimal;
  /** Landed cost of what would be bought. */
  spend: Decimal | null;
  /** Comparable cost per unit needed: landed cost, less the value of credit, plus risks. */
  score: Decimal | null;
  arrives: Date | null;
  flags: Flag[];
  usable: boolean;
  /** Against the last time this product was bought, in landed cost per unit. */
  vsLast: Decimal | null;
};

export type LineAnalysis = {
  lineId: number;
  itemId: number;
  code: string;
  name: string;
  unit: string;
  qty: Decimal;
  notes: string | null;
  lastLanded: { cost: Decimal; date: Date; supplier: string | null } | null;
  options: Option[];
  best: Option | null;
  /** How much cheaper the suggestion is per unit than the next usable offer. */
  marginOverNext: Decimal | null;
  chosen: Option | null;
};

/** Compare every offer on a request and suggest who to buy each product from. */
export async function analyseRfq(id: number) {
  const rfq = await db.rfq.findUnique({
    where: { id },
    include: {
      lines: { include: { item: true, quotes: { include: { supplier: true } } }, orderBy: { id: "asc" } },
      suppliers: { include: { supplier: true } },
      rates: true,
    },
  });
  if (!rfq) throw new UserError("That request for quotation no longer exists.");
  const [records, defaults, lots] = await Promise.all([
    supplierRecords(),
    latestRates(),
    db.lot.findMany({
      where: { itemId: { in: rfq.lines.map((l) => l.itemId) }, shipmentLineId: { not: null } },
      include: { shipmentLine: { include: { shipment: { include: { supplier: true } } } } },
      orderBy: [{ receivedDate: "desc" }, { id: "desc" }],
    }),
  ]);

  const saved = new Map(rfq.rates.map((r) => [r.currency, dec(r.rate)]));
  const currencies = [...new Set(rfq.lines.flatMap((l) => l.quotes.map((q) => q.currency)))].filter((c) => c !== "EGP").sort();
  const rates = currencies.map((c) => ({ currency: c, rate: saved.get(c) ?? defaults.get(c) ?? null, saved: saved.has(c) }));
  const rateOf = (c: string) => (c === "EGP" ? new Decimal(1) : (rates.find((r) => r.currency === c)?.rate ?? null));

  const now = today();
  const start = rfq.date > now ? rfq.date : now;

  const lines: LineAnalysis[] = rfq.lines.map((line) => {
    const qty = dec(line.qty);
    const last = lots.find((l) => l.itemId === line.itemId);
    const lastLanded = last ? { cost: dec(last.unitCostEgp), date: last.receivedDate, supplier: last.shipmentLine?.shipment.supplier.name ?? null } : null;

    const options: Option[] = line.quotes.map((q) => {
      const record = records.bySupplier.get(q.supplierId);
      const [factor, factorFrom] = record?.landedFactor ? [record.landedFactor, "supplier" as const] : records.overallFactor ? [records.overallFactor, "average" as const] : [new Decimal(1), "none" as const];
      const rate = rateOf(q.currency);
      const unitPrice = dec(q.unitPrice);
      const moq = q.moq == null ? null : dec(q.moq);
      const buyQty = moq && moq.gt(qty) ? moq : qty;
      const flags: Flag[] = [];
      const expired = q.validUntil !== null && q.validUntil < now;
      if (expired) flags.push({ kind: "expired", date: q.validUntil! });
      if (!rate) flags.push({ kind: "noRate", currency: q.currency });
      if (moq && moq.gt(qty)) flags.push({ kind: "moq", moq });
      if (!record) flags.push({ kind: "newSupplier" });

      const delay = record?.avgDaysLate ?? 0;
      const arrives = q.leadTimeDays != null ? addDays(start, q.leadTimeDays + Math.round(delay)) : null;
      const late = Boolean(arrives && rfq.neededBy && arrives > rfq.neededBy);
      if (late) flags.push({ kind: "late", arrives: arrives! });
      if (delay >= 3) flags.push({ kind: "slow", days: Math.round(delay) });

      let priceEgp: Decimal | null = null;
      let landedUnit: Decimal | null = null;
      let spend: Decimal | null = null;
      let score: Decimal | null = null;
      if (rate) {
        priceEgp = unitPrice.times(rate);
        landedUnit = priceEgp.times(factor);
        spend = landedUnit.times(buyQty);
        const credit = spend.times(q.paymentTermsDays ?? 0).div(365).times(MONEY_COST_PER_YEAR);
        if (q.paymentTermsDays) flags.push({ kind: "credit", days: q.paymentTermsDays, saving: credit });
        const risk = spend.times((late ? LATE_PENALTY : 0) + Math.min(delay, 30) * DELAY_PENALTY_PER_DAY);
        score = spend.minus(credit).plus(risk).div(qty);
      }
      return {
        quoteId: q.id,
        supplierId: q.supplierId,
        supplierName: q.supplier.name,
        currency: q.currency,
        unitPrice,
        moq,
        leadTimeDays: q.leadTimeDays,
        paymentTermsDays: q.paymentTermsDays,
        validUntil: q.validUntil,
        incoterm: q.incoterm,
        notes: q.notes,
        awardQty: q.awardQty == null ? null : dec(q.awardQty),
        purchaseOrderId: q.purchaseOrderId,
        priceEgp,
        landedUnit,
        factor,
        factorFrom,
        buyQty,
        spend,
        score,
        arrives,
        flags,
        usable: !expired && score !== null,
        vsLast: landedUnit && lastLanded && lastLanded.cost.gt(0) ? landedUnit.minus(lastLanded.cost).div(lastLanded.cost).times(100) : null,
      };
    });
    options.sort((a, b) => (a.usable !== b.usable ? (a.usable ? -1 : 1) : a.score && b.score ? a.score.comparedTo(b.score) : a.score ? -1 : b.score ? 1 : 0));
    // When every price has expired, still suggest the cheapest: it is flagged, and worth confirming with the supplier.
    const usable = options.filter((o) => o.usable);
    const ranked = usable.length ? usable : options.filter((o) => o.score !== null);
    const best = ranked[0] ?? null;
    return {
      lineId: line.id,
      itemId: line.itemId,
      code: line.item.code,
      name: line.item.name,
      unit: line.item.unit,
      qty,
      notes: line.notes,
      lastLanded,
      options,
      best,
      marginOverNext: best && ranked[1] ? ranked[1].score!.minus(best.score!) : null,
      chosen: options.find((o) => o.awardQty !== null) ?? null,
    };
  });

  // The suggested split against buying everything from one supplier, which means one shipment.
  const suggestedTotal = lines.reduce((s, l) => s.plus(l.best ? l.best.score!.times(l.qty) : 0), ZERO);
  const suggestedSuppliers = new Set(lines.flatMap((l) => (l.best ? [l.best.supplierId] : []))).size;
  const priced = lines.filter((l) => l.best);
  const singles = rfq.suppliers
    .map((s) => {
      const offers = priced.map((l) => l.options.find((o) => o.supplierId === s.supplierId && o.usable));
      if (!priced.length || offers.some((o) => !o)) return null;
      const total = offers.reduce((sum, o, i) => sum.plus(o!.score!.times(priced[i].qty)), ZERO);
      return { supplierId: s.supplierId, name: s.supplier.name, total, extra: total.minus(suggestedTotal) };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.total.comparedTo(b.total));

  const chosenTotal = lines.reduce((s, l) => s.plus(l.chosen?.spend ?? 0), ZERO);
  return {
    rfq,
    rates,
    records: records.bySupplier,
    lines,
    suggestedTotal,
    suggestedSuppliers,
    singles,
    chosenTotal,
    missingRates: rates.filter((r) => !r.rate).map((r) => r.currency),
  };
}
