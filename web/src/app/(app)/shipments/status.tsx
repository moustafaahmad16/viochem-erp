import type { ShipmentStatus } from "@prisma/client";
import { Badge } from "@/components/ui";
import { Tr } from "@/i18n/switch";

export const SHIPMENT_STATUS: Record<ShipmentStatus, { label: string; color: "gray" | "blue" | "amber" | "green" }> = {
  ORDERED: { label: "Ordered", color: "gray" },
  IN_TRANSIT: { label: "In transit", color: "blue" },
  AT_CUSTOMS: { label: "At customs", color: "amber" },
  RECEIVED: { label: "Received", color: "green" },
};

export function StatusBadge({ status }: { status: ShipmentStatus }) {
  const s = SHIPMENT_STATUS[status];
  return <Badge color={s.color}><Tr>{s.label}</Tr></Badge>;
}
