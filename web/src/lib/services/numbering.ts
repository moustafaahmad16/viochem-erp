import type { Tx } from "@/lib/db";

/** Next document number for a prefix, e.g. "INV" gives INV-2026-0001. Restarts each year. */
export async function nextNumber(tx: Tx, prefix: string, date: Date): Promise<string> {
  const key = `${prefix}-${date.getUTCFullYear()}`;
  const counter = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${key}-${String(counter.value).padStart(4, "0")}`;
}
