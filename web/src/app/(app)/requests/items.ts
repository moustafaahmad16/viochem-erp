import { db } from "@/lib/db";
import { availability, NOTHING } from "@/lib/services/reservations";
import type { RequestItem } from "./request-rows";

/** Our active products, with what is free to offer right now. */
export async function requestItems(): Promise<RequestItem[]> {
  const [items, free] = await Promise.all([db.item.findMany({ where: { active: true }, orderBy: { name: "asc" } }), availability()]);
  return items.map((i) => {
    const f = (free.get(i.id) ?? NOTHING).free;
    return { id: i.id, code: i.code, name: i.name, cas: i.casNumber, unit: i.unit, free: (f.gt(0) ? f : 0).toString() };
  });
}
