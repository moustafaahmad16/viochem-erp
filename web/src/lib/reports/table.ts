import Decimal from "decimal.js";
import type { T } from "@/i18n/core";
import { money, pct, qty } from "@/lib/format";

/**
 * A report as plain tables, so the same numbers can go to Excel or to a printable page (and from
 * there to PDF) exactly as they appear on screen. Titles are already in the reader's language.
 */

export type Kind = "text" | "money" | "money0" | "qty" | "pct" | "int" | "date";
export type Value = string | number | Decimal | Date | null | undefined;
export type Column = { title: string; kind?: Kind };
export type Section = { title?: string; columns: Column[]; rows: Value[][]; total?: Value[]; note?: string };
export type Report = { title: string; subtitle?: string; file: string; sections: Section[] };

export const isNumeric = (k: Kind | undefined) => k !== undefined && k !== "text" && k !== "date";

/** A cell as text, the way the screen shows it. */
export function display(t: T, v: Value, kind: Kind = "text"): string {
  if (v == null || v === "") return "";
  if (v instanceof Date) return t.date(v);
  if (kind === "text" || typeof v === "string") return String(v);
  if (kind === "money") return money(v);
  if (kind === "money0") return money(v, 0);
  if (kind === "pct") return pct(v);
  if (kind === "int") return String(Math.round(Number(v.toString())));
  return qty(v);
}

/** A cell as Excel should store it: numbers as numbers, so they can be added up. */
export function excelValue(v: Value, kind: Kind = "text"): string | number | Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v;
  if (v instanceof Decimal) return isNumeric(kind) ? v.toDecimalPlaces(kind === "qty" ? 3 : 2).toNumber() : v.toString();
  return v;
}

export const NUM_FMT: Partial<Record<Kind, string>> = { money: "#,##0.00", money0: "#,##0", qty: "#,##0.###", int: "0", pct: '0.0"%"', date: "dd mmm yyyy" };
