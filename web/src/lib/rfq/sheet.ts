import ExcelJS from "exceljs";
import { formatDate } from "@/lib/dates";
import { readDate, type Cell } from "@/lib/import/kinds";

/**
 * The Excel sheet sent to suppliers for a request for quotation, and reading it back when they reply.
 * One sheet goes to every supplier; each writes their company name at the top. The table holds only
 * #, CAS number, product, quantity and price. Currency and incoterms come from the request and sit
 * above it, with one lead time the supplier fills in for the whole offer. A hidden sheet remembers
 * which request it was made for and which product each # is, so a reply can't be loaded onto the wrong one.
 */

export const COLUMNS = [
  { key: "no", title: "#", width: 6 },
  { key: "cas", title: "CAS Number", width: 14 },
  { key: "name", title: "Product name", width: 40 },
  { key: "qty", title: "Qty", width: 14 },
  { key: "unitPrice", title: "Price per unit", width: 14, input: true },
] as const;

/** The columns of sheets sent before the table was simplified, still read when a supplier replies on one. */
const OLD_COLUMNS: { key: string; title: string }[] = [
  { key: "ref", title: "Ref" },
  { key: "unitPrice", title: "Your price per unit" },
  { key: "currency", title: "Currency" },
  { key: "moq", title: "Minimum order qty" },
  { key: "leadTimeDays", title: "Lead time (days)" },
  { key: "paymentTermsDays", title: "Payment terms (days)" },
  { key: "validUntil", title: "Price valid until" },
  { key: "incoterm", title: "Incoterm" },
  { key: "notes", title: "Your notes" },
];

/** The labels above the table that a reply is read from. */
const LABEL = { supplier: "Supplier", currency: "Currency", incoterm: "Incoterms", leadTime: "Lead time (days)" } as const;

const META = "viochem";
const INPUT_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7D6" } };
const HEAD_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD5ECE7" } };
const HINT_FONT: Partial<ExcelJS.Font> = { italic: true, color: { argb: "FF64748B" } };

export type SheetInput = {
  rfq: { id: number; number: string; date: Date; replyBy: Date | null; neededBy: Date | null; currency: string | null; incoterm: string | null; notes: string | null };
  /** Only when the sheet is for one supplier; otherwise they write their name in. */
  supplier?: { id: number; name: string; currency: string } | null;
  lines: { id: number; qty: { toString(): string }; notes: string | null; item: { code: string; name: string; casNumber: string | null; unit: string } }[];
  /** Prices this supplier already sent, so a second sheet can be corrected rather than retyped. */
  quotes?: Map<number, { unitPrice?: Cell; leadTimeDays?: Cell }>;
};

export async function buildSheet({ rfq, supplier, lines, quotes }: SheetInput): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = "VIOCHEM";
  const sheet = book.addWorksheet("Quotation");
  sheet.columns = COLUMNS.map((c) => ({ key: c.key, width: c.width }));

  sheet.addRow(["VIOCHEM · Request for quotation"]).font = { bold: true, size: 14 };
  const currency = rfq.currency ?? supplier?.currency ?? null;
  const leadTime = [...(quotes?.values() ?? [])].find((q) => q.leadTimeDays != null)?.leadTimeDays ?? "";
  // Label, value, and a hint beside it when the supplier is to fill it in.
  const info: [string, Cell, string?][] = [
    ["RFQ", rfq.number],
    [LABEL.supplier, supplier?.name ?? "", supplier ? undefined : "← your company name"],
    ["Date", formatDate(rfq.date)],
    ["Please reply by", formatDate(rfq.replyBy)],
    ["Needed in Egypt by", formatDate(rfq.neededBy)],
    [LABEL.currency, currency ?? "", currency ? undefined : "← e.g. USD"],
    [LABEL.incoterm, rfq.incoterm ?? "", rfq.incoterm ? undefined : "← e.g. CIF Alexandria"],
    [LABEL.leadTime, leadTime, "← days, order to Egypt"],
    ["Notes", rfq.notes ?? ""],
  ];
  for (const [label, value, hint] of info) {
    const row = sheet.addRow([label, "", value]);
    sheet.mergeCells(row.number, 1, row.number, 2);
    row.getCell(1).font = { bold: true };
    row.getCell(3).alignment = { horizontal: "left" };
    if (hint) {
      row.getCell(3).fill = INPUT_FILL;
      row.getCell(4).value = hint;
      row.getCell(4).font = HINT_FONT;
    }
  }
  sheet.addRow([]);
  const help = sheet.addRow(["Fill in the yellow cells: your company name, the lead time and a price per unit for each product you can supply. Leave the price empty for any you can't, and send this file back."]);
  help.font = HINT_FONT;
  help.height = 30;
  help.getCell(1).alignment = { wrapText: true, vertical: "top" };
  sheet.mergeCells(help.number, 1, help.number, COLUMNS.length);
  sheet.addRow([]);

  const head = sheet.addRow(COLUMNS.map((c) => c.title));
  head.font = { bold: true };
  head.eachCell((cell, col) => {
    cell.fill = "input" in COLUMNS[col - 1] ? INPUT_FILL : HEAD_FILL;
    cell.alignment = { wrapText: true, vertical: "middle", horizontal: col === 1 ? "center" : undefined };
  });
  const headRow = head.number;

  lines.forEach((l, i) => {
    const row = sheet.addRow({
      no: i + 1,
      cas: l.item.casNumber ?? "",
      name: l.notes ? `${l.item.name} (${l.notes})` : l.item.name,
      qty: Number(l.qty.toString()),
      unitPrice: quotes?.get(l.id)?.unitPrice ?? null,
    });
    row.getCell("no").alignment = { horizontal: "center" };
    // The unit shows beside the number, but the cell stays a number.
    row.getCell("qty").numFmt = `#,##0.###" ${l.item.unit.replace(/"/g, "")}"`;
    row.getCell("unitPrice").fill = INPUT_FILL;
  });
  sheet.views = [{ state: "frozen", ySplit: headRow }];

  const meta = book.addWorksheet(META, { state: "veryHidden" });
  meta.addRow(["rfq", rfq.id]);
  if (supplier) meta.addRow(["supplier", supplier.id]);
  meta.addRow(["number", rfq.number]);
  // The request line behind each #, in order.
  meta.addRow(["lines", lines.map((l) => l.id).join(",")]);
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

  // The sheet with the "#" header ("Ref" on older sheets); suppliers sometimes rename or reorder sheets.
  let sheet: ExcelJS.Worksheet | undefined;
  let headRow = 0;
  let old = false;
  for (const ws of book.worksheets) {
    if (ws.name === META) continue;
    for (let r = 1; r <= Math.min(ws.rowCount, 40) && !headRow; r++) {
      const first = str(plain(ws.getRow(r).getCell(1).value))?.toLowerCase();
      if (first === "#" || first === "ref") {
        sheet = ws;
        headRow = r;
        old = first === "ref";
      }
    }
    if (sheet) break;
  }
  if (!sheet) throw new Error("This isn't a VIOCHEM quotation sheet: no column titled # was found.");

  // What is filled in above the table: usually in the third column, but take the first filled cell after the label.
  const above = new Map<string, { value: Cell; row: number }>();
  for (let r = 1; r < headRow; r++) {
    const row = sheet.getRow(r);
    const label = str(plain(row.getCell(1).value))?.toLowerCase();
    if (!label) continue;
    for (let c = 2; c <= 6 && !above.has(label); c++) {
      const v = str(plain(row.getCell(c).value));
      if (v && !v.startsWith("←") && v.toLowerCase() !== label) above.set(label, { value: plain(row.getCell(c).value), row: r });
    }
  }
  const at = (label: string) => above.get(label.toLowerCase())?.value ?? null;
  reply.supplierName = str(at(LABEL.supplier));

  let leadTimeDays: number | null = null;
  try {
    leadTimeDays = wholeDays(at(LABEL.leadTime), "Lead time");
  } catch (e) {
    reply.errors.push({ row: above.get(LABEL.leadTime.toLowerCase())!.row, message: (e as Error).message });
  }
  const offer = { currency: str(at(LABEL.currency))?.toUpperCase() ?? null, incoterm: str(at(LABEL.incoterm))?.toUpperCase() ?? null, leadTimeDays };

  // Find columns by title, so a supplier moving a column doesn't break the reply.
  const columns: readonly { key: string; title: string }[] = old ? OLD_COLUMNS : COLUMNS;
  const col = new Map<string, number>();
  sheet.getRow(headRow).eachCell((cell, n) => {
    const title = str(plain(cell.value))?.toLowerCase();
    const c = columns.find((x) => x.title.toLowerCase() === title);
    if (c) col.set(c.key, n);
  });
  if (!col.has("unitPrice")) throw new Error(`The column "${columns.find((c) => c.key === "unitPrice")!.title}" is missing from the sheet.`);
  const cell = (r: ExcelJS.Row, key: string) => (col.has(key) ? plain(r.getCell(col.get(key)!).value) : null);

  // On older sheets each row carries its request line; now # is looked up in the hidden sheet.
  const lineIds = String(metaValue("lines") ?? "").split(",").map(Number).filter((n) => n > 0);
  if (!old && !lineIds.length) throw new Error("This isn't a VIOCHEM quotation sheet: its hidden part is missing. Send the supplier a new sheet.");

  for (let n = headRow + 1; n <= sheet.rowCount; n++) {
    const r = sheet.getRow(n);
    const no = id(cell(r, old ? "ref" : "no"));
    if (no === null) continue;
    try {
      const lineId = old ? no : lineIds[no - 1];
      if (!lineId) throw new Error(`There is no product #${no} on this request`);
      reply.rows.push({
        row: n,
        lineId,
        unitPrice: num(cell(r, "unitPrice"), "Price"),
        currency: str(cell(r, "currency"))?.toUpperCase() ?? offer.currency,
        moq: num(cell(r, "moq"), "Minimum order qty"),
        leadTimeDays: wholeDays(cell(r, "leadTimeDays"), "Lead time") ?? offer.leadTimeDays,
        paymentTermsDays: wholeDays(cell(r, "paymentTermsDays"), "Payment terms"),
        validUntil: readDate(cell(r, "validUntil")),
        incoterm: str(cell(r, "incoterm"))?.toUpperCase() ?? offer.incoterm,
        notes: str(cell(r, "notes")),
      });
    } catch (e) {
      reply.errors.push({ row: n, message: (e as Error).message });
    }
  }
  return reply;
}
