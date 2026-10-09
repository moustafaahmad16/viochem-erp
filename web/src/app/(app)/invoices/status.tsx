import type { EtaStatus, InvoiceStatus } from "@prisma/client";
import { Badge } from "@/components/ui";

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  if (status === "POSTED") return <Badge color="green">Posted</Badge>;
  if (status === "CANCELLED") return <Badge color="red">Cancelled</Badge>;
  return <Badge color="amber">Draft</Badge>;
}

const ETA: Record<EtaStatus, [string, "gray" | "green" | "blue" | "amber" | "red"]> = {
  NOT_SENT: ["Not sent", "gray"],
  SUBMITTED: ["Being checked", "blue"],
  VALID: ["Valid", "green"],
  INVALID: ["Invalid", "red"],
  REJECTED: ["Rejected", "red"],
  CANCELLED: ["Cancelled", "gray"],
};

export function EtaBadge({ status }: { status: EtaStatus }) {
  const [label, color] = ETA[status];
  return <Badge color={color}>{label}</Badge>;
}
