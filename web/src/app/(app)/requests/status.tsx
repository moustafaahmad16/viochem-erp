import type { CustomerRequestStatus } from "@prisma/client";
import { Badge } from "@/components/ui";
import { Tr } from "@/i18n/switch";
import type { LinePlan } from "@/lib/services/requests";

export const REQUEST_STATUS: Record<CustomerRequestStatus, { label: string; color: "blue" | "green" | "gray" }> = {
  OPEN: { label: "Open", color: "blue" },
  CONVERTED: { label: "Sent on", color: "green" },
  CANCELLED: { label: "Cancelled", color: "gray" },
};

export function RequestStatusBadge({ status }: { status: CustomerRequestStatus }) {
  const s = REQUEST_STATUS[status];
  return <Badge color={s.color}><Tr>{s.label}</Tr></Badge>;
}

const LINE: Record<LinePlan["kind"], { label: string; color: "green" | "amber" | "red" | "gray" }> = {
  stock: { label: "In stock", color: "green" },
  partial: { label: "Partly in stock", color: "amber" },
  none: { label: "Out of stock", color: "red" },
  "not-ours": { label: "We don't import", color: "gray" },
};

export function LineBadge({ kind }: { kind: LinePlan["kind"] }) {
  return <Badge color={LINE[kind].color}><Tr>{LINE[kind].label}</Tr></Badge>;
}
