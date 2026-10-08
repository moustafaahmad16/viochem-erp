import Decimal from "decimal.js";

type Num = Decimal.Value | { toString(): string } | null | undefined;

const toDecimal = (v: Num) => new Decimal(v == null ? 0 : v.toString());

export function money(v: Num, digits = 2): string {
  return toDecimal(v).toNumber().toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function qty(v: Num): string {
  return toDecimal(v).toNumber().toLocaleString("en-US", { maximumFractionDigits: 3 });
}

export function pct(v: Num): string {
  return `${toDecimal(v).toNumber().toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
}
