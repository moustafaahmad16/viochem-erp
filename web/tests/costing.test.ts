import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { invoiceTotals, landedUnitCosts, pickLots } from "@/lib/costing";
import { isValidCas } from "@/lib/chemistry";
import { formatDate, parseInputDate, shipmentDateProblem } from "@/lib/dates";

describe("landed cost", () => {
  it("spreads charges by goods value", () => {
    const costs = landedUnitCosts(
      [
        { id: 1, qty: 100, unitPrice: 10 }, // 1000 USD -> 50,000 EGP
        { id: 2, qty: 50, unitPrice: 60 }, //  3000 USD -> 150,000 EGP
      ],
      50,
      [10000, 10000],
    );
    expect(costs.get(1)!.toNumber()).toBe(550); // 500 + 5,000/100
    expect(costs.get(2)!.toNumber()).toBe(3300); // 3000 + 15,000/50
  });

  it("spreads charges by quantity", () => {
    const costs = landedUnitCosts(
      [
        { id: 1, qty: 100, unitPrice: 10 },
        { id: 2, qty: 100, unitPrice: 30 },
      ],
      1,
      [2000],
      "QUANTITY",
    );
    expect(costs.get(1)!.toNumber()).toBe(20);
    expect(costs.get(2)!.toNumber()).toBe(40);
  });

  it("works with no charges", () => {
    expect(landedUnitCosts([{ id: 1, qty: 3, unitPrice: 2 }], 48.5, []).get(1)!.toNumber()).toBe(97);
  });
});

describe("picking lots", () => {
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  const lots = [
    { id: 1, qtyOnHand: 10, expiryDate: null, receivedDate: d("2026-01-01") },
    { id: 2, qtyOnHand: 5, expiryDate: d("2027-06-01"), receivedDate: d("2026-03-01") },
    { id: 3, qtyOnHand: 5, expiryDate: d("2027-01-01"), receivedDate: d("2026-05-01") },
  ];

  it("takes earliest expiry first", () => {
    expect(pickLots(lots, 7)!.map((p) => [p.lotId, p.qty.toNumber()])).toEqual([
      [3, 5],
      [2, 2],
    ]);
  });

  it("uses lots without expiry last", () => {
    expect(pickLots(lots, 12)!.map((p) => p.lotId)).toEqual([3, 2, 1]);
  });

  it("refuses when stock is short", () => {
    expect(pickLots(lots, 20.001)).toBeNull();
  });
});

describe("invoice totals", () => {
  it("adds 14% VAT", () => {
    const t = invoiceTotals([{ qty: 25, unitPrice: 480 }], 14);
    expect([t.net.toNumber(), t.vat.toNumber(), t.total.toNumber()]).toEqual([12000, 1680, 13680]);
  });

  it("rounds to piasters", () => {
    expect(invoiceTotals([{ qty: 3, unitPrice: new Decimal("333.3333") }], 14).vat.toNumber()).toBe(140);
  });
});

describe("dates", () => {
  it("shows dates with a month name", () => {
    expect(formatDate(parseInputDate("2026-03-04"))).toBe("04 Mar 2026");
  });

  it("rejects impossible dates", () => {
    expect(() => parseInputDate("2026-02-30")).toThrow();
    expect(() => parseInputDate("04/03/2026")).toThrow();
    expect(parseInputDate("")).toBeNull();
  });

  it("checks shipment date order", () => {
    const d = (s: string) => parseInputDate(s);
    expect(shipmentDateProblem(d("2026-05-10"), d("2026-05-01"), null)).toMatch(/before/);
    expect(shipmentDateProblem(d("2026-05-01"), d("2026-05-20"), d("2026-05-22"))).toBeNull();
  });
});

describe("CAS numbers", () => {
  it("checks the check digit", () => {
    expect(isValidCas("78-70-6")).toBe(true); // linalool
    expect(isValidCas("121-33-5")).toBe(true); // vanillin
    expect(isValidCas("78-70-5")).toBe(false);
    expect(isValidCas("hello")).toBe(false);
  });
});
