import ExcelJS from "exceljs";
import { KINDS, type Cell, type KindName } from "./kinds";

/** Excel stores formulas, links and formatted text as objects; reduce each cell to its plain value. */
function plain(v: ExcelJS.CellValue): Cell {
  if (v == null) return null;
  if (v instanceof Date || typeof v !== "object") return v as Cell;
  if ("result" in v) return plain(v.result as ExcelJS.CellValue);
  if ("richText" in v) return v.richText.map((t) => t.text).join("");
  if ("text" in v) return String(v.text);
  if ("error" in v) return null;
  return String(v);
}

/** The rows of the first sheet in an .xlsx file, as plain values. */
export async function readRows(data: ArrayBuffer): Promise<Cell[][]> {
  const book = new ExcelJS.Workbook();
  try {
    await book.xlsx.load(data);
  } catch {
    throw new Error("That file couldn't be opened. Save it from Excel as .xlsx and try again.");
  }
  const sheet = book.worksheets[0];
  if (!sheet) return [];
  const rows: Cell[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row, n) => {
    const cells: Cell[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cells[col - 1] = plain(cell.value);
    });
    rows[n - 1] = cells;
  });
  return Array.from(rows, (r) => r ?? []);
}

/** A ready-to-fill template: headers, one example row, and a second sheet explaining each column. */
export async function template(kind: KindName): Promise<Buffer> {
  const { label, columns } = KINDS[kind];
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(label);
  sheet.columns = columns.map((c) => ({ header: c.title, key: c.key, width: Math.max(14, c.title.length + 4) }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD5ECE7" } };
  sheet.addRow(Object.fromEntries(columns.map((c) => [c.key, c.example])));
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const help = book.addWorksheet("How to fill");
  help.columns = [{ header: "Column", width: 28 }, { header: "Required", width: 10 }, { header: "Notes", width: 60 }];
  help.getRow(1).font = { bold: true };
  for (const c of columns) help.addRow([c.title, c.required ? "Yes" : "", c.note ?? ""]);
  help.addRow([]);
  help.addRow(["Replace the example row with your own. Keep the column titles as they are."]);
  return Buffer.from(await book.xlsx.writeBuffer());
}
