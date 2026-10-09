import ExcelJS from "exceljs";
import { excelValue, NUM_FMT, type Report } from "./table";

const HEAD_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD5ECE7" } };
const TOTAL_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };

/** One sheet with every section of the report under each other, numbers kept as numbers. */
export async function reportWorkbook(report: Report, rtl: boolean): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = "VIOCHEM";
  const sheet = book.addWorksheet(report.title.slice(0, 31).replace(/[\\/?*[\]:]/g, " "), { views: [{ rightToLeft: rtl }] });
  sheet.addRow([report.title]).font = { bold: true, size: 14 };
  if (report.subtitle) sheet.addRow([report.subtitle]).font = { color: { argb: "FF64748B" } };

  const widths: number[] = [];
  const widen = (i: number, text: string) => (widths[i] = Math.min(Math.max(widths[i] ?? 8, text.length + 2), 50));

  for (const s of report.sections) {
    sheet.addRow([]);
    if (s.title) sheet.addRow([s.title]).font = { bold: true, size: 12 };
    const head = sheet.addRow(s.columns.map((c) => c.title));
    head.font = { bold: true };
    head.eachCell((cell, n) => {
      cell.fill = HEAD_FILL;
      cell.alignment = { wrapText: true, vertical: "middle", horizontal: n > 1 && s.columns[n - 1]?.kind && s.columns[n - 1].kind !== "text" ? "right" : undefined };
    });
    s.columns.forEach((c, i) => widen(i, c.title));
    const add = (values: typeof s.rows[number], total = false) => {
      const row = sheet.addRow(values.map((v, i) => excelValue(v, s.columns[i]?.kind)));
      values.forEach((v, i) => {
        const fmt = NUM_FMT[s.columns[i]?.kind ?? "text"];
        if (fmt) row.getCell(i + 1).numFmt = fmt;
        widen(i, v == null ? "" : v instanceof Date ? "00 Mmm 0000" : v.toString());
      });
      if (total) {
        row.font = { bold: true };
        row.eachCell((cell) => (cell.fill = TOTAL_FILL));
      }
    };
    for (const r of s.rows) add(r);
    if (s.total) add(s.total, true);
    if (s.note) sheet.addRow([s.note]).font = { italic: true, color: { argb: "FF64748B" } };
  }
  widths.forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  return Buffer.from(await book.xlsx.writeBuffer());
}
