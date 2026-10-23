// Dates are stored as calendar days (no time) and always shown as "08 Oct 2026",
// so a day and a month can never be swapped when reading them.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(d: Date | null | undefined): string {
  if (!d) return "";
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Value for an <input type="date">. */
export function toInputDate(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

/** Parse "2026-10-08" from a date input; empty gives null. Throws on anything else. */
export function parseInputDate(value: FormDataEntryValue | null | undefined): Date | null {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`"${s}" is not a valid date`);
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw new Error(`"${s}" is not a valid date`);
  return d;
}

/** Today in Cairo, as a calendar day. */
export function today(): Date {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());
  return new Date(`${s}T00:00:00Z`);
}

/** The calendar day a timestamp falls on in Cairo, e.g. when a record was created. */
export function dayOf(t: Date): Date {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(t);
  return new Date(`${s}T00:00:00Z`);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

/** Shipment dates must run in order: left port, then expected, then arrived. */
export function shipmentDateProblem(etd: Date | null, eta: Date | null, arrival: Date | null): string | null {
  if (etd && eta && eta < etd) return "Expected arrival can't be before the departure date.";
  if (etd && arrival && arrival < etd) return "Arrival can't be before the departure date.";
  return null;
}

/** The days of a month picked as "2026-10", for filtering by date; null when no month is picked. */
export function monthRange(month: string | null | undefined): { gte: Date; lt: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month ?? "");
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
  const y = Number(m[1]), i = Number(m[2]) - 1;
  return { gte: new Date(Date.UTC(y, i, 1)), lt: new Date(Date.UTC(y, i + 1, 1)) };
}

/** Every month from the first date up to this month, newest first, as { key: "2026-10", label: "Oct 2026" }. */
export function monthsSince(first: Date | null | undefined, now = today()): { key: string; label: string }[] {
  const end = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const start = first ? Math.min(end, first.getUTCFullYear() * 12 + first.getUTCMonth()) : end;
  const months = [];
  for (let n = end; n >= start; n--) {
    const y = Math.floor(n / 12), i = n % 12;
    months.push({ key: `${y}-${String(i + 1).padStart(2, "0")}`, label: `${MONTHS[i]} ${y}` });
  }
  return months;
}
