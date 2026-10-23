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

/** A customer's address for printing: as typed, or else built from the parts the tax authority needs. */
export function customerAddress(c: { address: string | null; buildingNo: string | null; street: string | null; city: string | null; governate: string | null }): string {
  if (c.address?.trim()) return c.address.trim();
  const parts = [[c.buildingNo, c.street].filter(Boolean).join(" "), c.city, c.governate].filter(Boolean);
  return [...new Set(parts)].join(", ");
}

/** A list's address with these filters, leaving out empty ones. */
export function listHref(path: string, filters: Record<string, string | undefined>) {
  const q = new URLSearchParams(Object.entries(filters).filter((e): e is [string, string] => !!e[1])).toString();
  return q ? `${path}?${q}` : path;
}
