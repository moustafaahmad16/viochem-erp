import Decimal from "decimal.js";
import { isValidCas } from "@/lib/chemistry";

/**
 * What each Excel import expects. Every sheet has one header row with these column titles,
 * then one row per record. Checking is separate from saving so a file with any problem
 * saves nothing and the user sees every problem at once.
 */

export type Cell = string | number | boolean | Date | null;

export type Column = { key: string; title: string; required?: boolean; example: string | number; note?: string };

export type KindName = "products" | "suppliers" | "customers" | "stock";

export const KINDS: Record<KindName, { label: string; description: string; columns: Column[] }> = {
  products: {
    label: "Products",
    description: "Adds new products and updates existing ones with the same code.",
    columns: [
      { key: "code", title: "Code", required: true, example: "LIN-001" },
      { key: "name", title: "Name", required: true, example: "Linalool" },
      { key: "casNumber", title: "CAS number", example: "78-70-6" },
      { key: "unit", title: "Unit", example: "kg", note: "kg, L, g or pcs. Empty means kg." },
      { key: "hazardClass", title: "Hazard class", example: "Flammable liquid, Class 3" },
      { key: "notes", title: "Notes", example: "" },
    ],
  },
  suppliers: {
    label: "Suppliers",
    description: "Adds new suppliers and updates existing ones with the same name.",
    columns: [
      { key: "name", title: "Name", required: true, example: "Givaudan Aroma Chemicals" },
      { key: "country", title: "Country", example: "Switzerland" },
      { key: "currency", title: "Currency", example: "EUR", note: "Three letters, like USD or EUR. Empty means USD." },
      { key: "email", title: "Email", example: "" },
      { key: "phone", title: "Phone", example: "" },
      { key: "notes", title: "Notes", example: "" },
    ],
  },
  customers: {
    label: "Customers",
    description: "Adds new customers and updates existing ones with the same name.",
    columns: [
      { key: "name", title: "Name", required: true, example: "Cairo Fragrance House" },
      { key: "taxId", title: "Tax registration number", example: "200111222" },
      { key: "phone", title: "Phone", example: "" },
      { key: "email", title: "Email", example: "" },
      { key: "address", title: "Address", example: "Industrial Zone, 6th of October, Giza" },
      { key: "notes", title: "Notes", example: "" },
    ],
  },
  stock: {
    label: "Opening stock",
    description: "Adds one lot per row for stock you already have. Import products first.",
    columns: [
      { key: "code", title: "Product code", required: true, example: "LIN-001" },
      { key: "qty", title: "Quantity", required: true, example: 120 },
      { key: "unitCostEgp", title: "Cost per unit (EGP)", required: true, example: 685.5, note: "What it really cost you, landed" },
      { key: "expiryDate", title: "Expiry date", example: "2027-06-30", note: "A date cell, or text like 2027-06-30" },
      { key: "supplierBatchNo", title: "Supplier batch", example: "L240711" },
      { key: "date", title: "As of date", example: "2026-10-01", note: "Empty means today" },
    ],
  },
};

export type RowError = { row: number; message: string };

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/**
 * Read a date from a cell. Excel date cells and unambiguous text (2027-06-30, 30 Jun 2027) are accepted.
 * Text like 06/07/2027 is refused, because it could be June or July: that guess is how dates got mixed up before.
 */
export function readDate(v: Cell): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) throw new Error("isn't a valid date");
    // Excel stores a day; round to the nearest UTC midnight to drop any time-zone drift.
    return new Date(Math.round(v.getTime() / 86_400_000) * 86_400_000);
  }
  const s = String(v).trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ -](\d{4})$/.exec(s)) && MONTHS[match[2].toLowerCase()]) {
    [d, m, y] = [Number(match[1]), MONTHS[match[2].toLowerCase()], Number(match[3])];
  } else if (/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(s)) {
    throw new Error(`"${s}" could be read two ways. Write it as 2027-06-30 or 30 Jun 2027`);
  } else {
    throw new Error(`"${s}" isn't a date. Write it as 2027-06-30`);
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) throw new Error(`"${s}" isn't a real date`);
  return date;
}

function text(v: Cell): string | null {
  if (v == null) return null;
  const s = (v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).trim();
  return s || null;
}

function number(v: Cell, label: string, { allowZero = false } = {}): string {
  const s = text(v)?.replace(/,/g, "");
  if (!s) throw new Error(`${label} is missing`);
  let d: Decimal;
  try {
    d = new Decimal(s);
  } catch {
    throw new Error(`${label} "${s}" isn't a number`);
  }
  if (d.isNaN() || d.lt(0) || (!allowZero && d.isZero())) throw new Error(`${label} must be more than 0`);
  return d.toString();
}

export type ProductRow = { code: string; name: string; casNumber: string | null; unit: string; hazardClass: string | null; notes: string | null };
export type SupplierRow = { name: string; country: string | null; currency: string; email: string | null; phone: string | null; notes: string | null };
export type CustomerRow = { name: string; taxId: string | null; phone: string | null; email: string | null; address: string | null; notes: string | null };
export type StockRow = { code: string; qty: string; unitCostEgp: string; expiryDate: Date | null; supplierBatchNo: string | null; date: Date | null };

const UNITS = ["kg", "L", "g", "pcs"];

const PARSERS = {
  products: (r: Record<string, Cell>): ProductRow => {
    const cas = text(r.casNumber);
    if (cas && !isValidCas(cas)) throw new Error(`CAS number ${cas} isn't valid`);
    const unit = text(r.unit) ?? "kg";
    const known = UNITS.find((u) => u.toLowerCase() === unit.toLowerCase());
    if (!known) throw new Error(`Unit "${unit}" should be one of ${UNITS.join(", ")}`);
    return { code: text(r.code)!.toUpperCase(), name: text(r.name)!, casNumber: cas, unit: known, hazardClass: text(r.hazardClass), notes: text(r.notes) };
  },
  suppliers: (r: Record<string, Cell>): SupplierRow => {
    const currency = (text(r.currency) ?? "USD").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`Currency "${currency}" should be three letters, like USD`);
    return { name: text(r.name)!, country: text(r.country), currency, email: text(r.email), phone: text(r.phone), notes: text(r.notes) };
  },
  customers: (r: Record<string, Cell>): CustomerRow => ({
    name: text(r.name)!,
    taxId: text(r.taxId),
    phone: text(r.phone),
    email: text(r.email),
    address: text(r.address),
    notes: text(r.notes),
  }),
  stock: (r: Record<string, Cell>): StockRow => ({
    code: text(r.code)!.toUpperCase(),
    qty: number(r.qty, "Quantity"),
    unitCostEgp: number(r.unitCostEgp, "Cost", { allowZero: true }),
    expiryDate: readDate(r.expiryDate),
    supplierBatchNo: text(r.supplierBatchNo),
    date: readDate(r.date),
  }),
};

export type ParsedRows = { products: ProductRow[]; suppliers: SupplierRow[]; customers: CustomerRow[]; stock: StockRow[] };

/**
 * Check a sheet's rows (the first row being the headers) and return either the records or every problem found.
 * Row numbers in messages match what the user sees in Excel.
 */
export function parseSheet<K extends KindName>(kind: K, rows: Cell[][]): { records: ParsedRows[K]; errors: RowError[]; rowNumbers: number[] } {
  const { columns } = KINDS[kind];
  const errors: RowError[] = [];
  const header = (rows[0] ?? []).map((h) => text(h)?.toLowerCase().replace(/\s+/g, " ") ?? "");
  const index: Record<string, number> = {};
  for (const col of columns) {
    const i = header.indexOf(col.title.toLowerCase());
    if (i >= 0) index[col.key] = i;
    else if (col.required) errors.push({ row: 1, message: `The column "${col.title}" is missing. Use the template.` });
  }
  if (errors.length) return { records: [] as unknown as ParsedRows[K], errors, rowNumbers: [] };

  const records: unknown[] = [];
  const rowNumbers: number[] = [];
  const seen = new Map<string, number>();
  rows.slice(1).forEach((cells, i) => {
    const rowNo = i + 2;
    const r: Record<string, Cell> = {};
    for (const col of columns) r[col.key] = index[col.key] === undefined ? null : (cells[index[col.key]] ?? null);
    if (columns.every((c) => text(r[c.key]) === null)) return; // blank line
    const missing = columns.filter((c) => c.required && text(r[c.key]) === null);
    if (missing.length) {
      errors.push({ row: rowNo, message: `${missing.map((c) => c.title).join(" and ")} ${missing.length > 1 ? "are" : "is"} missing` });
      return;
    }
    try {
      const record = PARSERS[kind](r);
      if (kind !== "stock") {
        const key = String((record as { code?: string; name: string }).code ?? (record as { name: string }).name).toLowerCase();
        if (seen.has(key)) {
          errors.push({ row: rowNo, message: `Same as row ${seen.get(key)}` });
          return;
        }
        seen.set(key, rowNo);
      }
      records.push(record);
      rowNumbers.push(rowNo);
    } catch (e) {
      errors.push({ row: rowNo, message: (e as Error).message });
    }
  });
  if (!records.length && !errors.length) errors.push({ row: 2, message: "The sheet has no rows to import" });
  return { records: records as ParsedRows[K], errors, rowNumbers };
}
