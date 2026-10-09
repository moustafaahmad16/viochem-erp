import ExcelJS from "exceljs";
import { formatDate } from "@/lib/dates";
import { readDate, type Cell } from "@/lib/import/kinds";

/**
 * The Excel sheet sent to suppliers for a request for quotation, and reading it back when they reply.
 * One sheet goes to every supplier; each writes their company name at the top. A hidden sheet
 * remembers which request it was made for, so a reply can't be loaded onto the wrong one.
 */

export const COLUMNS = [
  { key: "ref", title: "Ref", width: 8 },
  { key: "code", title: "Code", width: 12 },
  { key: "name", title: "Product", width: 28 },
  { key: "cas", title: "CAS", width: 12 },
  { key: "qty", title: "Quantity", width: 11 },
  { key: "unit", title: "Unit", width: 7 },
  { key: "unitPrice", title: "Your price per unit", width: 14, input: true },
  { key: "currency", title: "Currency", width: 10, input: true },
  { key: "moq", title: "Minimum order qty", width: 13, input: true },
  { key: "leadTimeDays", title: "Lead time (days)", width: 12, input: true, note: "From order to arrival in Egypt" },
  { key: "paymentTermsDays", title: "Payment terms (days)", width: 13, input: true },
  { key: "validUntil", title: "Price valid until", width: 14, input: true },
  { key: "incoterm", title: "Incoterm", width: 10, input: true },
  { key: "notes", title: "Your notes", width: 30, input: true },
] as const;

const META = "viochem";
const INPUT_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7D6" } };
const HEAD_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD5ECE7" } };

export type SheetInput = {
  rfq: { id: number; number: string; date: Date; replyBy: Date | null; neededBy: Date | null; notes: string | null };
  /** Only when the sheet is for one supplier; otherwise they write their name in. */
  supplier?: { id: number; name: string; currency: string } | null;
  lines: { id: number; qty: { toString(): string }; notes: string | null; item: { code: string; name: string; casNumber: string | null; unit: string } }[];
  /** Prices this supplier already sent, so a second sheet can be corrected rather than retyped. */
  quotes?: Map<number, Record<string, Cell>>;
};

export async function buildSheet({ rfq, supplier, lines, quotes }: SheetInput): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = "VIOCHEM";
  const sheet = book.addWorksheet("Quotation");
  sheet.columns = COLUMNS.map((c) => ({ key: c.key, width: c.width }));

  sheet.addRow(["VIOCHEM · Request for quotation"]).font = { bold: true, size: 14 };
  const info: [string, string][] = [
    ["RFQ", rfq.number],
    ["Supplier", supplier?.name ?? ""],
    ["Date", formatDate(rfq.date)],
    ["Please reply by", formatDate(rfq.replyBy)],
    ["Needed in Egypt by", formatDate(rfq.neededBy)],
    ["Notes", rfq.notes ?? ""],
  ];
  for (const [k, v] of info) {
    const row = sheet.addRow([k, "", v]);
    row.getCell(1).font = { bold: true };
    if (k === "Supplier" && !supplier) {
      row.getCell(3).fill = INPUT_FILL;
      row.getCell(4).value = "← your company name";
      row.getCell(4).font = { italic: true, color: { argb: "FF64748B" } };
    }
  }
  sheet.addRow(["Write your company name, fill in the yellow columns for each product you can supply, leave the price empty for any you can't, and send this file back."]).font = { italic: true, color: { argb: "FF64748B" } };
  sheet.addRow([]);

  const head = sheet.addRow(COLUMNS.map((c) => c.title));
  head.font = { bold: true };
  head.eachCell((cell, col) => {
    cell.fill = COLUMNS[col - 1] && "input" in COLUMNS[col - 1] ? INPUT_FILL : HEAD_FILL;
    cell.alignment = { wrapText: true, vertical: "middle" };
  });
  const headRow = head.number;

  for (const l of lines) {
    const q = quotes?.get(l.id) ?? {};
    const row = sheet.addRow({
      ref: l.id,
      code: l.item.code,
      name: l.notes ? `${l.item.name} (${l.notes})` : l.item.name,
      cas: l.item.casNumber ?? "",
      qty: Number(l.qty.toString()),
      unit: l.item.unit,
      currency: supplier?.currency ?? "",
      ...q,
    });
    COLUMNS.forEach((c, i) => {
      if ("input" in c) row.getCell(i + 1).fill = INPUT_FILL;
    });
    row.getCell("validUntil").numFmt = "yyyy-mm-dd";
  }
  sheet.views = [{ state: "frozen", ySplit: headRow }];

  const meta = book.addWorksheet(META, { state: "veryHidden" });
  meta.addRow(["rfq", rfq.id]);
  if (supplier) meta.addRow(["supplier", supplier.id]);
  meta.addRow(["number", rfq.number]);
  return Buffer.from(await book.xlsx.writeBuffer());
}

export type ReplyRow = {
  row: number;
  lineId: number;
  unitPrice: string | null;
  currency: string | null;
  moq: string | null;
  leadTimeDays: number | null;
  paymentTermsDays: number | null;
  validUntil: Date | null;
  incoterm: string | null;
  notes: string | null;
};

export type Reply = {
  rfqId: number | null;
  supplierId: number | null;
  /** The company name the supplier wrote at the top of the sheet. */
  supplierName?: string | null;
  number: string | null;
  rows: ReplyRow[];
  errors: { row: number; message: string }[];
};

function plain(v: ExcelJS.CellValue): Cell {
  if (v == null) return null;
  if (v instanceof Date || typeof v !== "object") return v as Cell;
  if ("result" in v) return plain(v.result as ExcelJS.CellValue);
  if ("richText" in v) return v.richText.map((t) => t.text).join("");
  if ("text" in v) return String(v.text);
  return null;
}

const str = (v: Cell) => {
  if (v == null) return null;
  const s = (v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).trim();
  return s || null;
};

function num(v: Cell, label: string): string | null {
  const s = str(v)?.replace(/[,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} "${s}" isn't a number`);
  return s;
}

function wholeDays(v: Cell, label: string): number | null {
  const s = str(v);
  if (!s) return null;
  const n = Number(s.replace(/\s*days?$/i, ""));
  if (!Number.isInteger(n) || n < 0 || n > 730) throw new Error(`${label} "${s}" should be whole days`);
  return n;
}

/** Read a supplier's reply. Rows without a price mean they didn't quote that product. */
export async function readReply(data: ArrayBuffer): Promise<Reply> {
  const book = new ExcelJS.Workbook();
  try {
    await book.xlsx.load(data);
  } catch {
    throw new Error("That file couldn't be opened. Save it from Excel as .xlsx and try again.");
  }
  const meta = book.getWorksheet(META);
  const metaValue = (key: string) => {
    if (!meta) return null;
    for (let r = 1; r <= meta.rowCount; r++) if (plain(meta.getRow(r).getCell(1).value) === key) return plain(meta.getRow(r).getCell(2).value);
    return null;
  };
  const id = (v: Cell) => (typeof v === "number" ? v : v != null && /^\d+$/.test(String(v)) ? Number(v) : null);
  const reply: Reply = { rfqId: id(metaValue("rfq")), supplierId: id(metaValue("supplier")), number: str(metaValue("number")), rows: [], errors: [] };

  // The sheet with the "Ref" header; suppliers sometimes rename or reorder sheets.
  let sheet: ExcelJS.Worksheet | undefined;
  let headRow = 0;
  for (const ws of book.worksheets) {
    if (ws.name === META) continue;
    for (let r = 1; r <= Math.min(ws.rowCount, 40) && !headRow; r++) {
      if (str(plain(ws.getRow(r).getCell(1).value))?.toLowerCase() === "ref") {
        sheet = ws;
        headRow = r;
      }
    }
    if (sheet) break;
  }
  if (!sheet) throw new Error("This isn't a VIOCHEM quotation sheet: no column titled Ref was found.");

  for (let r = 1; r < headRow; r++) {
    const row = sheet.getRow(r);
    if (str(plain(row.getCell(1).value))?.toLowerCase() === "supplier") {
      // Usually in the third column, but take the first filled cell after the label.
      for (let c = 2; c <= 6 && !reply.supplierName; c++) {
        const v = str(plain(row.getCell(c).value));
        if (v && !v.startsWith("←")) reply.supplierName = v;
      }
    }
  }

  // Find columns by title, so a supplier moving a column doesn't break the reply.
  const head = sheet.getRow(headRow);
  const col = new Map<string, number>();
  head.eachCell((cell, n) => {
    const title = str(plain(cell.value))?.toLowerCase();
    const c = COLUMNS.find((x) => x.title.toLowerCase() === title);
    if (c) col.set(c.key, n);
  });
  for (const key of ["ref", "unitPrice"]) {
    if (!col.has(key)) throw new Error(`The column "${COLUMNS.find((c) => c.key === key)!.title}" is missing from the sheet.`);
  }
  const cell = (r: ExcelJS.Row, key: string) => (col.has(key) ? plain(r.getCell(col.get(key)!).value) : null);

  for (let n = headRow + 1; n <= sheet.rowCount; n++) {
    const r = sheet.getRow(n);
    const lineId = id(cell(r, "ref"));
    if (lineId === null) continue;
    try {
      reply.rows.push({
        row: n,
        lineId,
        unitPrice: num(cell(r, "unitPrice"), "Price"),
        currency: str(cell(r, "currency"))?.toUpperCase() ?? null,
        moq: num(cell(r, "moq"), "Minimum order qty"),
        leadTimeDays: wholeDays(cell(r, "leadTimeDays"), "Lead time"),
        paymentTermsDays: wholeDays(cell(r, "paymentTermsDays"), "Payment terms"),
        validUntil: readDate(cell(r, "validUntil")),
        incoterm: str(cell(r, "incoterm"))?.toUpperCase() ?? null,
        notes: str(cell(r, "notes")),
      });
    } catch (e) {
      reply.errors.push({ row: n, message: (e as Error).message });
    }
  }
  return reply;
}
