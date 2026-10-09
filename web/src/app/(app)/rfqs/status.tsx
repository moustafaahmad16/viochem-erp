import type { RfqStatus } from "@prisma/client";
import { Badge } from "@/components/ui";
import { Tr } from "@/i18n/switch";

export const RFQ_STATUS: Record<RfqStatus, { label: string; color: "blue" | "green" | "gray" }> = {
  OPEN: { label: "Collecting prices", color: "blue" },
  ORDERED: { label: "Ordered", color: "green" },
  CANCELLED: { label: "Cancelled", color: "gray" },
};

export function RfqStatusBadge({ status }: { status: RfqStatus }) {
  const s = RFQ_STATUS[status];
  return <Badge color={s.color}><Tr>{s.label}</Tr></Badge>;
}
