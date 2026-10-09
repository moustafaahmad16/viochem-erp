import Decimal from "decimal.js";

/**
 * Egyptian Tax Authority (ETA) e-invoice documents, with no database or network access.
 *
 * References (ETA SDK):
 * - Invoice v1.0 structure: https://sdk.invoicing.eta.gov.eg/documents/invoice-v1-0/
 * - Serialization for signing: https://sdk.invoicing.eta.gov.eg/document-serialization-approach/
 * - Tax types (T1 = VAT, V009 = general item sales): https://sdk.invoicing.eta.gov.eg/codes/tax-types/
 * - Unit types: https://sdk.invoicing.eta.gov.eg/codes/unit-types/
 */

const DECIMALS = 5;
const VAT = "T1";
const VAT_GENERAL = "V009";

/** ETA unit codes for the units products are kept in. */
export const UNIT_TYPES: Record<string, string> = { kg: "KGM", L: "LTR", g: "GRM", pcs: "EA" };

const round = (v: Decimal.Value) => new Decimal(v).toDecimalPlaces(DECIMALS).toNumber();

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/**
 * Canonical ETA serialization of a document, the text that gets signed.
 * Property names are upper-cased and quoted, values are quoted exactly as they appear in the JSON sent,
 * objects recurse, and each array element is preceded by the array's property name.
 */
export function serialize(value: Json): string {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value)
      .map(([name, item]) => {
        const key = `"${name.toUpperCase()}"`;
        return Array.isArray(item) ? key + item.map((el) => key + serialize(el)).join("") : key + serialize(item);
      })
      .join("");
  }
  if (typeof value === "number" || typeof value === "boolean") return `"${JSON.stringify(value)}"`;
  return `"${value ?? ""}"`;
}

export type Party = {
  type: "B" | "P" | "F";
  id: string;
  name: string;
  country: string;
  governate: string;
  city: string;
  street: string;
  buildingNo: string;
  postalCode?: string | null;
  branchId?: string; // issuer only
};

export type Line = { description: string; itemType: string; itemCode: string; unitType: string; internalCode: string; qty: Decimal.Value; unitPrice: Decimal.Value; vatRate: Decimal.Value };

export type Document = {
  issuer: Party;
  receiver: Party;
  internalId: string;
  dateTimeIssued: string;
  activityCode: string;
  version: string;
  documentType?: "I" | "C" | "D";
  lines: Line[];
};

function party(p: Party) {
  const address: Record<string, string> = {};
  if (p.branchId !== undefined) address.branchID = p.branchId;
  Object.assign(address, { country: p.country, governate: p.governate, regionCity: p.city, street: p.street, buildingNumber: p.buildingNo });
  if (p.postalCode) address.postalCode = p.postalCode;
  return { address, type: p.type, id: p.id, name: p.name };
}

function line(l: Line) {
  const salesTotal = round(new Decimal(l.qty).times(l.unitPrice));
  const vat = round(new Decimal(salesTotal).times(l.vatRate).div(100));
  return {
    description: l.description,
    itemType: l.itemType,
    itemCode: l.itemCode,
    unitType: l.unitType,
    quantity: round(l.qty),
    internalCode: l.internalCode,
    salesTotal,
    total: round(new Decimal(salesTotal).plus(vat)),
    valueDifference: 0,
    totalTaxableFees: 0,
    netTotal: salesTotal,
    itemsDiscount: 0,
    unitValue: { currencySold: "EGP", amountEGP: round(l.unitPrice) },
    discount: { rate: 0, amount: 0 },
    taxableItems: [{ taxType: VAT, amount: vat, subType: VAT_GENERAL, rate: round(l.vatRate) }],
  };
}

/** The JSON ETA expects for one invoice, without its signature. */
export function buildDocument(d: Document) {
  const lines = d.lines.map(line);
  const sum = (f: (l: (typeof lines)[number]) => number) => round(lines.reduce((s, l) => s.plus(f(l)), new Decimal(0)));
  const net = sum((l) => l.netTotal);
  const vat = sum((l) => l.taxableItems[0].amount);
  return {
    issuer: party(d.issuer),
    receiver: party(d.receiver),
    documentType: d.documentType ?? "I",
    documentTypeVersion: d.version,
    dateTimeIssued: d.dateTimeIssued,
    taxpayerActivityCode: d.activityCode,
    internalID: d.internalId,
    invoiceLines: lines,
    totalDiscountAmount: 0,
    totalSalesAmount: sum((l) => l.salesTotal),
    netAmount: net,
    taxTotals: [{ taxType: VAT, amount: vat }],
    totalAmount: round(new Decimal(net).plus(vat)),
    extraDiscountAmount: 0,
    totalItemsDiscountAmount: 0,
  };
}

export type EtaDocument = ReturnType<typeof buildDocument>;

export function withSignature(doc: EtaDocument, signature: string | null) {
  return signature ? { ...doc, signatures: [{ signatureType: "I", value: signature }] } : doc;
}

/**
 * When the invoice was issued, in UTC as ETA wants it. ETA refuses times in the future, so the
 * time of posting is used when it is on the invoice's day, otherwise 10:00 Cairo on that day.
 */
export function issuedAt(invoiceDate: Date, postedAt: Date | null, now = new Date()): string {
  const day = invoiceDate.toISOString().slice(0, 10);
  const cairoDay = (t: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(t);
  let t = postedAt && cairoDay(postedAt) === day ? postedAt : new Date(`${day}T08:00:00Z`);
  if (t > now) t = new Date(now.getTime() - 60_000);
  return t.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Everything missing before a document can be sent, in words a person can act on. */
export function problems(d: { issuer: Party; activityCode: string; receiver: Party & { label: string }; lines: (Line & { productName: string })[]; total: Decimal.Value }) {
  const out: string[] = [];
  const i = d.issuer;
  if (!/^\d{9}$/.test(i.id)) out.push("VIOCHEM's tax registration number (9 digits) isn't set in E-invoice settings.");
  if (!d.activityCode) out.push("The activity code isn't set in E-invoice settings.");
  if (!i.governate || !i.city || !i.street || !i.buildingNo) out.push("VIOCHEM's address isn't complete in E-invoice settings.");
  const r = d.receiver;
  // A person buying less than EGP 50,000 needs no ID or address; everyone else does.
  const needsDetails = r.type !== "P" || new Decimal(d.total).gte(50000);
  if (r.type === "B" && !/^\d{9}$/.test(r.id)) out.push(`${r.label} needs a 9-digit tax registration number.`);
  if (r.type !== "B" && needsDetails && !r.id) out.push(`${r.label} needs a national ID or passport number for invoices of EGP 50,000 or more.`);
  if (needsDetails && (!r.governate || !r.city || !r.street || !r.buildingNo)) out.push(`${r.label} needs governorate, city, street and building number.`);
  for (const l of d.lines) if (!l.itemCode) out.push(`${l.productName} has no ETA item code.`);
  return out;
}
