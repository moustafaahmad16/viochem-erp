import Decimal from "decimal.js";

export type LandedLine = { id: number; qty: Decimal.Value; unitPrice: Decimal.Value };

/**
 * Landed cost per unit, in EGP, for each line of a shipment.
 * Goods value is converted at the shipment's rate, then every charge (freight, duty, clearance)
 * is spread over the lines by goods value or by quantity.
 */
export function landedUnitCosts(
  lines: LandedLine[],
  fxRate: Decimal.Value,
  chargesEgp: Decimal.Value[],
  method: "VALUE" | "QUANTITY" = "VALUE",
): Map<number, Decimal> {
  const totalCharges = chargesEgp.reduce<Decimal>((sum, c) => sum.plus(c), new Decimal(0));
  const values = lines.map((l) => new Decimal(l.qty).times(l.unitPrice).times(fxRate));
  const basis = method === "VALUE" ? values : lines.map((l) => new Decimal(l.qty));
  const basisTotal = basis.reduce((sum, b) => sum.plus(b), new Decimal(0));

  const result = new Map<number, Decimal>();
  lines.forEach((line, i) => {
    const qty = new Decimal(line.qty);
    if (qty.isZero()) {
      result.set(line.id, new Decimal(0));
      return;
    }
    const share = basisTotal.isZero() ? new Decimal(0) : totalCharges.times(basis[i]).div(basisTotal);
    result.set(line.id, values[i].plus(share).div(qty));
  });
  return result;
}

export type AvailableLot = { id: number; qtyOnHand: Decimal.Value; expiryDate: Date | null; receivedDate: Date };

/**
 * Which lots to take stock from: earliest expiry first, then oldest received.
 * Lots with no expiry go last. Returns null when there isn't enough stock.
 */
export function pickLots(lots: AvailableLot[], qty: Decimal.Value): { lotId: number; qty: Decimal }[] | null {
  let remaining = new Decimal(qty);
  const ordered = [...lots].sort((a, b) => {
    const ea = a.expiryDate?.getTime() ?? Infinity;
    const eb = b.expiryDate?.getTime() ?? Infinity;
    if (ea !== eb) return ea - eb;
    return a.receivedDate.getTime() - b.receivedDate.getTime() || a.id - b.id;
  });

  const picks: { lotId: number; qty: Decimal }[] = [];
  for (const lot of ordered) {
    if (remaining.lte(0)) break;
    const onHand = new Decimal(lot.qtyOnHand);
    if (onHand.lte(0)) continue;
    const take = Decimal.min(onHand, remaining);
    picks.push({ lotId: lot.id, qty: take });
    remaining = remaining.minus(take);
  }
  return remaining.gt(0) ? null : picks;
}

export function invoiceTotals(lines: { qty: Decimal.Value; unitPrice: Decimal.Value }[], vatRate: Decimal.Value) {
  const net = lines.reduce((sum, l) => sum.plus(new Decimal(l.qty).times(l.unitPrice)), new Decimal(0)).toDecimalPlaces(2);
  const vat = net.times(vatRate).div(100).toDecimalPlaces(2);
  return { net, vat, total: net.plus(vat) };
}
