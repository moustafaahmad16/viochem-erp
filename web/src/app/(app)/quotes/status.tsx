import type { QuoteStatus } from "@prisma/client";
import { Badge } from "@/components/ui";
import { Tr } from "@/i18n/switch";
import { isExpired } from "@/lib/services/quotes";

export function QuoteStatusBadge({ status, validUntil }: { status: QuoteStatus; validUntil: Date | null }) {
  if (status === "ACCEPTED") return <Badge color="green"><Tr>Accepted</Tr></Badge>;
  if (status === "DECLINED") return <Badge color="red"><Tr>Declined</Tr></Badge>;
  if (isExpired({ status, validUntil })) return <Badge color="amber"><Tr>Expired</Tr></Badge>;
  return <Badge color="blue"><Tr>Open</Tr></Badge>;
}
