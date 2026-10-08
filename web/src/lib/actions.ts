import Decimal from "decimal.js";
import { Prisma } from "@prisma/client";
import { UserError } from "@/lib/services/errors";
import { parseInputDate } from "@/lib/dates";
import type { FormState } from "@/components/forms";

/** Turn an error into a message for the form. Unexpected errors are logged, not shown. */
export function fail(e: unknown): FormState {
  if (e instanceof UserError) return { error: e.message };
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    return { error: "That name or code is already used. Choose another one." };
  }
  if (e instanceof Error && /valid date/.test(e.message)) return { error: e.message };
  console.error(e);
  return { error: "Something went wrong. Please try again." };
}

export function text(fd: FormData, name: string): string | null {
  const v = fd.get(name);
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
}

export function required(fd: FormData, name: string, label: string): string {
  const v = text(fd, name);
  if (!v) throw new UserError(`${label} is required.`);
  return v;
}

export function decimal(fd: FormData, name: string, label: string, { min = 0, allowZero = false } = {}): string {
  const raw = required(fd, name, label).replace(/,/g, "");
  let d: Decimal;
  try {
    d = new Decimal(raw);
  } catch {
    throw new UserError(`${label} must be a number.`);
  }
  if (d.lt(min) || (!allowZero && d.isZero())) throw new UserError(`${label} must be more than ${min}.`);
  return d.toString();
}

export function int(fd: FormData, name: string, label: string): number {
  const n = Number(required(fd, name, label));
  if (!Number.isInteger(n)) throw new UserError(`Choose a ${label.toLowerCase()}.`);
  return n;
}

export function date(fd: FormData, name: string, label: string): Date {
  const d = parseInputDate(fd.get(name));
  if (!d) throw new UserError(`${label} is required.`);
  return d;
}

export const optionalDate = (fd: FormData, name: string) => parseInputDate(fd.get(name));
