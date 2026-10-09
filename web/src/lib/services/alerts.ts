import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { onOrder } from "./orders";

const dec = (v: { toString(): string } | null | undefined) => new Decimal(v == null ? 0 : v.toString());

export type LowStockRow = { itemId: number; code: string; name: string; unit: string; onHand: Decimal; minQty: Decimal; coming: Decimal; short: Decimal };

/**
 * Products at or below the level set on them, with what is already ordered or on the way,
 * so it is clear which ones still need ordering.
 */
export async function lowStock(): Promise<LowStockRow[]> {
  const [items, coming] = await Promise.all([
    db.item.findMany({ where: { active: true, minQty: { not: null } }, include: { lots: { where: { qtyOnHand: { gt: 0 } }, select: { qtyOnHand: true } } }, orderBy: { name: "asc" } }),
    onOrder(),
  ]);
  return items
    .map((i) => {
      const onHand = i.lots.reduce((s, l) => s.plus(dec(l.qtyOnHand)), new Decimal(0));
      const minQty = dec(i.minQty);
      const c = coming.get(i.id) ?? new Decimal(0);
      return { itemId: i.id, code: i.code, name: i.name, unit: i.unit, onHand, minQty, coming: c, short: Decimal.max(minQty.minus(onHand).minus(c), 0) };
    })
    .filter((r) => r.onHand.lte(r.minQty));
}
