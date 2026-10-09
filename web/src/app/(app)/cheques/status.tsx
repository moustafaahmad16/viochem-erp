import type { ChequeDirection, ChequeStatus } from "@prisma/client";
import { Badge } from "@/components/ui";
import { Tr } from "@/i18n/switch";

const STATUS: Record<ChequeStatus, [string, string, "gray" | "green" | "blue" | "amber" | "red"]> = {
  // [received, issued, colour]
  PENDING: ["In hand", "Not cashed yet", "amber"],
  DEPOSITED: ["Deposited", "Deposited", "blue"],
  CLEARED: ["Cleared", "Cashed", "green"],
  BOUNCED: ["Bounced", "Returned", "red"],
};

export const chequeStatusLabel = (status: ChequeStatus, direction: ChequeDirection) => STATUS[status][direction === "RECEIVED" ? 0 : 1];

export function ChequeStatusBadge({ status, direction }: { status: ChequeStatus; direction: ChequeDirection }) {
  return <Badge color={STATUS[status][2]}><Tr>{chequeStatusLabel(status, direction)}</Tr></Badge>;
}
