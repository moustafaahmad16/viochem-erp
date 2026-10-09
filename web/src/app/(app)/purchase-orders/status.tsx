import type { PurchaseOrderStatus } from "@prisma/client";
import { Badge } from "@/components/ui";
import { Tr } from "@/i18n/switch";

export const ORDER_STATUS: Record<PurchaseOrderStatus, { label: string; color: "blue" | "green" | "gray" }> = {
  OPEN: { label: "Open", color: "blue" },
  CLOSED: { label: "Closed", color: "green" },
  CANCELLED: { label: "Cancelled", color: "gray" },
};

export function OrderStatusBadge({ status }: { status: PurchaseOrderStatus }) {
  const s = ORDER_STATUS[status];
  return <Badge color={s.color}><Tr>{s.label}</Tr></Badge>;
}
