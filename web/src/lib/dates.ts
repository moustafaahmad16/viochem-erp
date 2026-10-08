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

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

/** Shipment dates must run in order: left port, then expected, then arrived. */
export function shipmentDateProblem(etd: Date | null, eta: Date | null, arrival: Date | null): string | null {
  if (etd && eta && eta < etd) return "Expected arrival can't be before the departure date.";
  if (etd && arrival && arrival < etd) return "Arrival can't be before the departure date.";
  return null;
}
