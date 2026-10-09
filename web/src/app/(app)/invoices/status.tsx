import type { EtaStatus, InvoiceStatus } from "@prisma/client";
import { Badge } from "@/components/ui";
import { Tr } from "@/i18n/switch";

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  if (status === "POSTED") return <Badge color="green"><Tr>Posted</Tr></Badge>;
  if (status === "CANCELLED") return <Badge color="red"><Tr>Cancelled</Tr></Badge>;
  return <Badge color="amber"><Tr>Draft</Tr></Badge>;
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
  return <Badge color={color}><Tr>{label}</Tr></Badge>;
}
