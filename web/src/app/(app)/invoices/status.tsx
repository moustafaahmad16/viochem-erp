import type { InvoiceStatus } from "@prisma/client";
import { Badge } from "@/components/ui";

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  if (status === "POSTED") return <Badge color="green">Posted</Badge>;
  if (status === "CANCELLED") return <Badge color="red">Cancelled</Badge>;
  return <Badge color="amber">Draft</Badge>;
}
