/**
 * Fills an empty database with a year of made-up trading, to show the system working:
 * products, suppliers and customers, shipments landed with freight and duty, sales, payments,
 * cheques, expenses and a return. Everything goes through the same services the app uses,
 * so stock, costs and balances all add up.
 *
 *   DATABASE_URL=postgresql://…/viochem_demo npx tsx prisma/demo.ts
 *
 * It only runs on a database whose name contains "demo", and only when it has no invoices yet.
 */
import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { addDays, today } from "@/lib/dates";
import { recordExpense } from "@/lib/services/banking";
import { clearCheque, depositCheque, receiveCheque } from "@/lib/services/cheques";
import { addCreditLine, createCreditNote, postCreditNote } from "@/lib/services/credits";
import { addOpeningStock, createInvoice, createShipment, postInvoice, receiveShipment } from "@/lib/services/inventory";
import { recordCustomerPayment, recordSupplierPayment } from "@/lib/services/payments";

if (!/demo/.test(new URL(process.env.DATABASE_URL ?? "postgresql://x/none").pathname)) {
  throw new Error("Demo data only goes into a database whose name contains 'demo'.");
}

// The same made-up year every time.
let seed = 20261009;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
const int = (lo: number, hi: number) => Math.floor(between(lo, hi + 1));
const pick = <T extends { weight: number }>(xs: T[]) => {
  const total = xs.reduce((s, x) => s + x.weight, 0);
  let r = rand() * total;
  for (const x of xs) if ((r -= x.weight) <= 0) return x;
  return xs[xs.length - 1];
};
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

const START = day("2025-10-01");
const END = today();

const SUPPLIERS = [
  { key: "giv", name: "Givaudan Aroma Chemicals", country: "Switzerland", currency: "EUR", terms: 60, leadDays: 42, lateDays: [0, 12] },
  { key: "basf", name: "BASF Aroma Ingredients", country: "Germany", currency: "EUR", terms: 45, leadDays: 38, lateDays: [0, 3] },
  { key: "nhu", name: "Zhejiang NHU", country: "China", currency: "USD", terms: 0, leadDays: 55, lateDays: [0, 20] },
  { key: "sym", name: "Symrise", country: "Germany", currency: "EUR", terms: 60, leadDays: 40, lateDays: [0, 6] },
  { key: "tak", name: "Takasago International", country: "Japan", currency: "USD", terms: 30, leadDays: 60, lateDays: [0, 9] },
  { key: "local", name: "Al Ahram Chemicals", country: "Egypt", currency: "EGP", terms: 30, leadDays: 7, lateDays: [0, 2] },
] as const;

// cost: in the supplier's currency per kg. price: selling price in EGP per kg. weight: how much it sells.
const PRODUCTS = [
  { code: "LIN-001", name: "Linalool", cas: "78-70-6", supplier: "basf", cost: 9.5, price: 780, weight: 10, min: 400 },
  { code: "LIM-001", name: "Limonene", cas: "5989-27-5", supplier: "nhu", cost: 4.2, price: 340, weight: 9, min: 500 },
  { code: "VAN-001", name: "Vanillin", cas: "121-33-5", supplier: "nhu", cost: 14, price: 1150, weight: 7, min: 150 },
  { code: "CIT-001", name: "Citral", cas: "5392-40-5", supplier: "basf", cost: 16, price: 1250, weight: 5, min: 120 },
  { code: "GER-001", name: "Geraniol", cas: "106-24-1", supplier: "sym", cost: 13, price: 1050, weight: 3, min: 100 },
  { code: "ISO-001", name: "Iso E Super", cas: "54464-57-2", supplier: "giv", cost: 22, price: 1850, weight: 6, min: 150 },
  { code: "HED-001", name: "Hedione", cas: "24851-98-7", supplier: "giv", cost: 26, price: 2150, weight: 5, min: 120 },
  { code: "AMB-001", name: "Ambroxan", cas: "6790-58-5", supplier: "giv", cost: 310, price: 24500, weight: 1.2, min: 5 },
  { code: "COU-001", name: "Coumarin", cas: "91-64-5", supplier: "sym", cost: 11, price: 900, weight: 3, min: 80 },
  { code: "ETV-001", name: "Ethyl vanillin", cas: "121-32-4", supplier: "tak", cost: 18, price: 1500, weight: 3, min: 60 },
  { code: "MEN-001", name: "L-Menthol", cas: "2216-51-5", supplier: "tak", cost: 21, price: 1700, weight: 4, min: 100 },
  { code: "DPG-001", name: "Dipropylene glycol", cas: "25265-71-8", supplier: "local", cost: 95, price: 135, weight: 8, min: 800 },
  // Bought once and hardly sold since: shows up as not moving.
  { code: "BEN-001", name: "Benzyl acetate", cas: "140-11-4", supplier: "sym", cost: 7, price: 600, weight: 0, min: null },
] as const;

const CUSTOMERS = [
  { name: "Cairo Fragrance House", terms: 30, weight: 10, payDelay: [0, 12], city: "Cairo" },
  { name: "Delta Cosmetics", terms: 45, weight: 8, payDelay: [5, 40], city: "Tanta" },
  { name: "Nile Detergents", terms: 30, weight: 7, payDelay: [-5, 10], city: "10th of Ramadan" },
  { name: "Alexandria Soap Co.", terms: 30, weight: 5, payDelay: [10, 70], city: "Alexandria" },
  { name: "Pharaoh Perfumes", terms: 15, weight: 4, payDelay: [0, 8], city: "Giza" },
  { name: "Golden Air Fresheners", terms: 60, weight: 4, payDelay: [0, 25], city: "6th of October" },
  { name: "Sinai Personal Care", terms: 30, weight: 3, payDelay: [20, 90], city: "Ismailia" },
  { name: "Green Leaf Aromatics", terms: 30, weight: 2, payDelay: [0, 5], city: "Cairo" },
  { name: "Mansoura Home Care", terms: 45, weight: 1.5, payDelay: [0, 15], city: "Mansoura" },
] as const;

// EGP for one unit, drifting through the year.
const rate = (currency: string, d: Date) => {
  if (currency === "EGP") return new Decimal(1);
  const months = (d.getTime() - START.getTime()) / (30 * 86_400_000);
  const base = currency === "EUR" ? 55.2 : 48.4;
  return new Decimal(base + months * 0.12 + Math.sin(months) * 0.4).toDecimalPlaces(4);
};

type Job = () => Promise<unknown>;
const agenda = new Map<string, Job[]>();
let current = START;
// Anything due on a day already gone runs today instead.
const later = (d: Date, job: Job) => {
  if (d > END) return;
  const k = iso(d < current ? current : d);
  agenda.set(k, [...(agenda.get(k) ?? []), job]);
};

async function onHand(itemId: number) {
  const r = await db.lot.aggregate({ where: { itemId }, _sum: { qtyOnHand: true } });
  return Number(r._sum.qtyOnHand ?? 0);
}

async function main() {
  if (await db.invoice.count()) throw new Error("This database already has invoices. Use an empty one.");

  const accounts = {
    cib: await db.moneyAccount.create({ data: { name: "CIB current", kind: "BANK", currency: "EGP", openingBalance: 2_400_000, openingDate: START } }),
    nbe: await db.moneyAccount.create({ data: { name: "NBE current", kind: "BANK", currency: "EGP", openingBalance: 650_000, openingDate: START } }),
    usd: await db.moneyAccount.create({ data: { name: "CIB USD", kind: "BANK", currency: "USD", openingBalance: 18_000, openingFxRate: 48.4, openingDate: START } }),
    cash: await db.moneyAccount.create({ data: { name: "Office cash", kind: "CASH", currency: "EGP", openingBalance: 60_000, openingDate: START } }),
  };

  const suppliers = new Map<string, { id: number; s: (typeof SUPPLIERS)[number] }>();
  for (const s of SUPPLIERS) {
    const row = await db.supplier.create({ data: { name: s.name, country: s.country, currency: s.currency, paymentTermsDays: s.terms } });
    suppliers.set(s.key, { id: row.id, s });
  }
  const customers: ((typeof CUSTOMERS)[number] & { id: number })[] = [];
  for (const c of CUSTOMERS) {
    const row = await db.customer.create({ data: { name: c.name, paymentTermsDays: c.terms, city: c.city, governate: c.city } });
    customers.push({ ...c, id: row.id });
  }
  const products: ((typeof PRODUCTS)[number] & { id: number })[] = [];
  for (const p of PRODUCTS) {
    const row = await db.item.create({ data: { code: p.code, name: p.name, casNumber: p.cas, minQty: p.min } });
    products.push({ ...p, id: row.id });
  }

  // A month's sales of each product, in kg, sized so the business turns over about EGP 3 million a month.
  const monthly = new Map(products.map((p) => [p.id, Math.max(0, (p.weight / 70) * 3_000_000) / p.price]));
  for (const p of products) {
    const qty = p.weight ? Math.round(monthly.get(p.id)! * 2.5) : 200;
    const cost = new Decimal(p.cost).times(rate(suppliers.get(p.supplier)!.s.currency, START)).times(1.12).toDecimalPlaces(2);
    await addOpeningStock({ itemId: p.id, qty, unitCostEgp: cost.toString(), date: START, expiryDate: addDays(START, int(300, 700)), supplierBatchNo: null });
  }

  const coming = new Map<number, number>();
  let usdLeft = new Decimal(18_000);
  let chequeNo = 10045800;

  // Each month, order what each supplier's products will need for the next few months.
  async function orderStock(d: Date) {
    for (const [, { id: supplierId, s }] of suppliers) {
      // Nobody has reordered from these two since the summer, so the safety stock view has work to show.
      if ((s.key === "basf" || s.key === "sym") && d > day("2026-07-15")) continue;
      const lines: { p: (typeof products)[number]; qty: number }[] = [];
      for (const p of products.filter((x) => x.supplier === s.key && x.weight > 0)) {
        const need = monthly.get(p.id)!;
        const have = (await onHand(p.id)) + (coming.get(p.id) ?? 0);
        if (have < need * (s.key === "local" ? 1.2 : 2.2)) lines.push({ p, qty: Math.round((need * between(2, 3)) / 5) * 5 });
      }
      if (!lines.length) continue;
      const fx = rate(s.currency, d);
      const eta = addDays(d, s.leadDays);
      const sh = await createShipment({ supplierId, currency: s.currency, fxRate: fx.toString(), orderDate: d, etd: s.key === "local" ? null : addDays(d, 10), eta, supplierInvoiceNo: `PI-${int(10000, 99999)}`, allocation: "VALUE", notes: null });
      let value = new Decimal(0);
      for (const { p, qty } of lines) {
        const price = new Decimal(p.cost).times(between(0.94, 1.08)).toDecimalPlaces(2);
        value = value.plus(price.times(qty));
        await db.shipmentLine.create({ data: { shipmentId: sh.id, itemId: p.id, qty, unitPrice: price, expiryDate: addDays(eta, int(360, 900)), supplierBatchNo: `B${int(100000, 999999)}` } });
        coming.set(p.id, (coming.get(p.id) ?? 0) + qty);
      }
      const arrives = addDays(eta, int(s.lateDays[0], s.lateDays[1]));
      if (arrives <= END) {
        later(arrives, async () => {
          if (s.key !== "local") {
            const egp = value.times(fx);
            const charges = [
              { kind: "Freight", amountEgp: egp.times(between(0.03, 0.05)).toDecimalPlaces(2) },
              { kind: "Customs duty", amountEgp: egp.times(0.05).toDecimalPlaces(2) },
              { kind: "Clearance", amountEgp: new Decimal(int(6, 14) * 1000) },
            ];
            for (const c of charges) await db.shipmentCharge.create({ data: { shipmentId: sh.id, ...c, date: arrives, accountId: accounts.cib.id } });
          }
          await receiveShipment(sh.id, arrives);
          for (const { p, qty } of lines) coming.set(p.id, (coming.get(p.id) ?? 0) - qty);
        });
      } else {
        await db.shipment.update({ where: { id: sh.id }, data: { status: addDays(d, 12) <= END ? "IN_TRANSIT" : "ORDERED" } });
      }
      // Pay on the due date, or a little after; prepaid suppliers are paid on ordering.
      // Givaudan is often paid late, so something shows as overdue.
      const pay = addDays(d, s.terms + (s.terms ? int(0, s.key === "giv" ? 45 : 12) : 1));
      const fromUsd = s.currency === "USD" && usdLeft.gt(value);
      if (fromUsd) usdLeft = usdLeft.minus(value);
      later(pay, () =>
        recordSupplierPayment(supplierId, {
          date: pay, amount: value.toFixed(2), currency: s.currency, fxRate: rate(s.currency, pay).toString(), method: "BANK_TRANSFER",
          reference: `SWIFT ${int(100000, 999999)}`, notes: null, shipmentId: sh.id, accountId: fromUsd ? accounts.usd.id : accounts.cib.id,
        }),
      );
    }
  }

  async function sell(d: Date) {
    const c = pick(customers);
    const inv = await createInvoice(c.id, d);
    const chosen = new Set<number>();
    for (let i = int(1, 3); i > 0; i--) {
      const p = pick(products.filter((x) => !chosen.has(x.id) && (x.weight > 0 || (x.code === "BEN-001" && d < day("2026-02-01")))).map((x) => ({ ...x, weight: x.weight || 0.5 })));
      chosen.add(p.id);
      const avg = Math.max(monthly.get(p.id)! / 12, 5);
      const want = p.code === "AMB-001" ? int(1, 4) : Math.round((avg * between(0.4, 1.8)) / 5) * 5 || 5;
      const qty = Math.min(want, Math.floor(await onHand(p.id)));
      if (qty <= 0) continue;
      await db.invoiceLine.create({ data: { invoiceId: inv.id, itemId: p.id, qty, unitPrice: new Decimal(p.price).times(between(0.94, 1.08)).toDecimalPlaces(0) } });
    }
    if (!(await db.invoiceLine.count({ where: { invoiceId: inv.id } }))) return db.invoice.delete({ where: { id: inv.id } });
    await postInvoice(inv.id);
    const total = await invoiceTotal(inv.id);
    const paidOn = addDays(d, c.terms + int(c.payDelay[0], c.payDelay[1]));
    if (rand() < 0.25) {
      // Paid by a post-dated cheque, deposited when due.
      const due = addDays(d, c.terms);
      later(addDays(d, int(3, 10)), async () => {
        const ch = await receiveCheque({ customerId: c.id, invoiceId: inv.id, date: addDays(d, 5), dueDate: due, amount: total.toFixed(2), chequeNo: String(chequeNo++), bank: pick([{ v: "CIB", weight: 3 }, { v: "NBE", weight: 2 }, { v: "QNB", weight: 1 }]).v, notes: null });
        later(due, () => depositCheque(ch.id, accounts.cib.id, due));
        later(addDays(due, 3), () => clearCheque(ch.id, addDays(due, 3)));
      });
    } else {
      later(paidOn, () =>
        recordCustomerPayment(c.id, { date: paidOn, amount: total.toFixed(2), method: rand() < 0.1 ? "CASH" : "BANK_TRANSFER", reference: null, notes: null, invoiceId: inv.id, accountId: rand() < 0.7 ? accounts.cib.id : accounts.nbe.id }),
      );
    }
    return inv;
  }

  async function invoiceTotal(id: number) {
    const lines = await db.invoiceLine.findMany({ where: { invoiceId: id } });
    return lines.reduce((s, l) => s.plus(new Decimal(l.qty.toString()).times(l.unitPrice.toString())), new Decimal(0)).times(1.14).toDecimalPlaces(2);
  }

  async function expenses(d: Date) {
    const list = [
      { category: "Salaries", amount: 185_000, account: accounts.cib.id },
      { category: "Social insurance", amount: 24_500, account: accounts.cib.id },
      { category: "Rent", amount: 38_000, account: accounts.cib.id },
      { category: "Warehouse", amount: 22_000, account: accounts.cib.id },
      { category: "Electricity and water", amount: int(5, 9) * 1000, account: accounts.cash.id },
      { category: "Phone and internet", amount: 3_200, account: accounts.cash.id },
      { category: "Transport to customers", amount: int(18, 32) * 1000, account: accounts.cash.id },
      { category: "Vehicles and fuel", amount: int(9, 15) * 1000, account: accounts.cash.id },
    ];
    for (const e of list) {
      await recordExpense({ date: d, category: e.category, description: null, payee: null, amount: String(e.amount), vat: "0", accountId: e.account, reference: null });
    }
  }

  for (let d = START; d <= END; d = addDays(d, 1)) {
    current = d;
    for (const job of agenda.get(iso(d)) ?? []) await job();
    const weekday = d.getUTCDay();
    if (weekday === 5 && d < END) continue; // Friday, but show some sales today
    if (d.getUTCDate() <= 7 && weekday === 0) await orderStock(d); // the first Sunday
    if (d.getUTCDate() === 25) await expenses(d);
    // A busier spring and autumn, a quieter summer.
    const season = 1 + 0.25 * Math.cos(((d.getUTCMonth() - 3) / 6) * Math.PI);
    for (let n = rand() < 0.5 * season ? 2 : 1; n > 0; n--) if (rand() < 0.8 || d.getTime() === END.getTime()) await sell(d);
    // Top up the cash box from the bank each month.
    if (d.getUTCDate() === 2) await db.transfer.create({ data: { date: d, fromAccountId: accounts.cib.id, toAccountId: accounts.cash.id, amount: 60_000, toAmount: 60_000, note: "Petty cash" } });
  }

  // One return: a drum of Citral that arrived at the customer damaged.
  const line = await db.invoiceLine.findFirst({ where: { item: { code: "CIT-001" }, invoice: { status: "POSTED", date: { gte: day("2026-05-01") } } }, include: { invoice: true } });
  if (line) {
    const note = await createCreditNote(line.invoiceId, addDays(line.invoice.date, 6), "Damaged drum returned");
    await addCreditLine(note.id, { invoiceLineId: line.id, qty: Math.min(25, Number(line.qty)), restock: true });
    await postCreditNote(note.id);
  }

  const counts = { invoices: await db.invoice.count(), shipments: await db.shipment.count(), payments: await db.customerPayment.count(), cheques: await db.cheque.count() };
  console.log("Demo data loaded", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
