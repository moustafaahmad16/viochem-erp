import Decimal from "decimal.js";
import { money } from "@/lib/format";
import { customerAccounts } from "./accounts";

/**
 * Whether a customer can take on more debt. Posting an invoice that would take them over their
 * credit limit is refused unless an admin chooses to go ahead; overdue invoices only warn.
 */
export async function creditCheck(customerId: number, adding: Decimal.Value = 0) {
  const [acc] = await customerAccounts({ id: customerId });
  const limit = acc.customer.creditLimit ? new Decimal(acc.customer.creditLimit.toString()) : null;
  const after = acc.balance.plus(adding);
  const overLimit = limit !== null && after.gt(limit);
  const name = acc.customer.name;
  const warnings: string[] = [];
  if (overLimit) warnings.push(`${name} would owe EGP ${money(after)}, over their credit limit of EGP ${money(limit!)}.`);
  if (acc.overdue.gt(0)) warnings.push(`${name} has EGP ${money(acc.overdue)} overdue.`);
  return { limit, balance: acc.balance, overdue: acc.overdue, after, overLimit, warnings, headroom: limit === null ? null : limit.minus(acc.balance) };
}
