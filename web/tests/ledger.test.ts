import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { aging, settle } from "@/lib/ledger";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const bill = (key: string, due: string, amount: number) => ({ key, date: d(due), dueDate: d(due), amount: new Decimal(amount) });
const owed = (r: ReturnType<typeof settle>) => Object.fromEntries(r.bills.map((b) => [b.key, b.outstanding.toNumber()]));

describe("settle", () => {
  it("pays the oldest bills first", () => {
    const r = settle([bill("b", "2026-02-01", 500), bill("a", "2026-01-01", 300)], [{ amount: new Decimal(400) }]);
    expect(owed(r)).toEqual({ a: 0, b: 400 });
    expect(r.balance.toNumber()).toBe(400);
  });

  it("pays a named bill first and lets the rest flow to the oldest", () => {
    const r = settle([bill("a", "2026-01-01", 300), bill("b", "2026-02-01", 500)], [{ amount: new Decimal(600), billKey: "b" }]);
    expect(owed(r)).toEqual({ a: 200, b: 0 });
  });

  it("keeps overpayment as credit", () => {
    const r = settle([bill("a", "2026-01-01", 300)], [{ amount: new Decimal(500) }]);
    expect(owed(r)).toEqual({ a: 0 });
    expect(r.unapplied.toNumber()).toBe(200);
    expect(r.balance.toNumber()).toBe(-200);
  });

  it("treats a payment naming an unknown bill as a general payment", () => {
    const r = settle([bill("a", "2026-01-01", 300)], [{ amount: new Decimal(100), billKey: "gone" }]);
    expect(owed(r)).toEqual({ a: 200 });
  });
});

describe("aging", () => {
  it("sorts what is owed by days late", () => {
    const r = settle(
      [bill("now", "2026-06-30", 1), bill("late10", "2026-06-20", 2), bill("late45", "2026-05-16", 4), bill("late75", "2026-04-16", 8), bill("late200", "2025-12-12", 16)],
      [],
    );
    expect(aging(r.bills, d("2026-06-30")).map((v) => v.toNumber())).toEqual([1, 2, 4, 8, 16]);
  });
});
