import { db } from "@/lib/db";
import { today } from "@/lib/dates";
import { parseSheet, type Cell, type KindName, type RowError } from "@/lib/import/kinds";
import { nextNumber } from "./numbering";

export type ImportResult = { errors: RowError[]; created: number; updated: number };

/** Check every row, then save all of them together, or nothing if any row has a problem. */
export async function importRows(kind: KindName, rows: Cell[][]): Promise<ImportResult> {
  const { records, errors, rowNumbers } = parseSheet(kind, rows);
  if (errors.length) return { errors, created: 0, updated: 0 };

  if (kind === "stock") {
    const stock = records as ReturnType<typeof parseSheet<"stock">>["records"];
    const items = await db.item.findMany({ where: { code: { in: [...new Set(stock.map((r) => r.code))] } } });
    const byCode = new Map(items.map((i) => [i.code, i.id]));
    const missing = stock.flatMap((r, i) => (byCode.has(r.code) ? [] : [{ row: rowNumbers[i], message: `No product with code ${r.code}. Import products first.` }]));
    if (missing.length) return { errors: missing, created: 0, updated: 0 };

    await db.$transaction(
      async (tx) => {
        for (const r of stock) {
          const date = r.date ?? today();
          const lot = await tx.lot.create({
            data: {
              lotNo: await nextNumber(tx, "LOT", date),
              itemId: byCode.get(r.code)!,
              receivedDate: date,
              qtyReceived: r.qty,
              qtyOnHand: r.qty,
              unitCostEgp: r.unitCostEgp,
              expiryDate: r.expiryDate,
              supplierBatchNo: r.supplierBatchNo,
            },
          });
          await tx.stockMove.create({ data: { lotId: lot.id, date, kind: "OPENING", qty: r.qty, unitCostEgp: r.unitCostEgp, note: "Opening stock (Excel)" } });
        }
      },
      { timeout: 60_000 },
    );
    return { errors: [], created: stock.length, updated: 0 };
  }

  let created = 0;
  let updated = 0;
  await db.$transaction(
    async (tx) => {
      if (kind === "products") {
        for (const r of records as ReturnType<typeof parseSheet<"products">>["records"]) {
          const exists = await tx.item.findUnique({ where: { code: r.code } });
          await tx.item.upsert({ where: { code: r.code }, create: r, update: r });
          if (exists) updated++;
          else created++;
        }
      } else if (kind === "suppliers") {
        for (const r of records as ReturnType<typeof parseSheet<"suppliers">>["records"]) {
          const exists = await tx.supplier.findFirst({ where: { name: { equals: r.name, mode: "insensitive" } } });
          if (exists) await tx.supplier.update({ where: { id: exists.id }, data: r });
          else await tx.supplier.create({ data: r });
          if (exists) updated++;
          else created++;
        }
      } else {
        for (const r of records as ReturnType<typeof parseSheet<"customers">>["records"]) {
          const exists = await tx.customer.findFirst({ where: { name: { equals: r.name, mode: "insensitive" } } });
          if (exists) await tx.customer.update({ where: { id: exists.id }, data: r });
          else await tx.customer.create({ data: r });
          if (exists) updated++;
          else created++;
        }
      }
    },
    { timeout: 60_000 },
  );
  return { errors: [], created, updated };
}
