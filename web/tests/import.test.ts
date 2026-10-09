import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { parseSheet, readDate } from "@/lib/import/kinds";
import { readRows, template } from "@/lib/import/excel";
import { importRows } from "@/lib/services/importer";

describe("readDate", () => {
  it("accepts Excel dates and unambiguous text", () => {
    expect(readDate(new Date(Date.UTC(2027, 5, 30, 0, 0, 7)))?.toISOString()).toBe("2027-06-30T00:00:00.000Z");
    expect(readDate("2027-06-30")?.toISOString()).toBe("2027-06-30T00:00:00.000Z");
    expect(readDate("30 Jun 2027")?.toISOString()).toBe("2027-06-30T00:00:00.000Z");
    expect(readDate("")).toBeNull();
  });
  it("refuses dates that could be read two ways, or don't exist", () => {
    expect(() => readDate("06/07/2027")).toThrow(/two ways/);
    expect(() => readDate("2027-02-30")).toThrow(/real date/);
    expect(() => readDate("soon")).toThrow(/isn't a date/);
  });
});

describe("parseSheet", () => {
  it("reads products, skipping blank rows, with Excel row numbers in errors", () => {
    const { records, errors } = parseSheet("products", [
      ["Code", "Name", "CAS number", "Unit"],
      ["lin-001", "Linalool", "78-70-6", "KG"],
      [],
      ["VAN-001", "Vanillin", "121-33-6", "kg"],
      ["LIN-001", "Linalool again"],
      ["X", "", null, "box"],
    ]);
    expect(records).toHaveLength(1);
    expect(errors).toEqual([
      { row: 4, message: "CAS number 121-33-6 isn't valid" },
      { row: 5, message: "Same as row 2" },
      { row: 6, message: "Name is missing" },
    ]);
  });
  it("returns clean records", () => {
    const { records, errors } = parseSheet("products", [["code", "name"], ["lin-001", "Linalool"]]);
    expect(errors).toEqual([]);
    expect(records[0]).toMatchObject({ code: "LIN-001", unit: "kg", casNumber: null });
  });
  it("needs the required columns", () => {
    expect(parseSheet("stock", [["Product code", "Quantity"]]).errors[0].message).toMatch(/Cost per unit/);
  });
  it("checks stock numbers and dates", () => {
    const { errors } = parseSheet("stock", [
      ["Product code", "Quantity", "Cost per unit (EGP)", "Expiry date"],
      ["A", "1,200.5", 0, "2027-06-30"],
      ["A", 0, 5],
      ["A", 5, "abc"],
      ["A", 5, 5, "06/07/2027"],
    ]);
    expect(errors.map((e) => e.row)).toEqual([3, 4, 5]);
  });
  it("refuses an empty sheet and bad currencies", () => {
    expect(parseSheet("customers", [["Name"]]).errors[0].message).toMatch(/no rows/);
    expect(parseSheet("suppliers", [["Name", "Currency"], ["S", "Euro"]]).errors[0].message).toMatch(/three letters/);
  });
});

describe("templates", () => {
  it("round-trip through readRows", async () => {
    const buf = await template("stock");
    const rows = await readRows(new Uint8Array(buf).buffer);
    expect(rows[0]).toEqual(["Product code", "Quantity", "Cost per unit (EGP)", "Expiry date", "Supplier batch", "As of date"]);
    expect(parseSheet("stock", rows).errors).toEqual([]);
  });
});

describe("importRows", () => {
  it("adds products, then updates them by code", async () => {
    const first = await importRows("products", [["Code", "Name"], ["IMP-1", "Citral"], ["IMP-2", "Geraniol"]]);
    expect(first).toEqual({ errors: [], created: 2, updated: 0 });
    const second = await importRows("products", [["Code", "Name"], ["imp-1", "Citral 95%"], ["IMP-3", "Eugenol"]]);
    expect(second).toEqual({ errors: [], created: 1, updated: 1 });
    expect((await db.item.findUniqueOrThrow({ where: { code: "IMP-1" } })).name).toBe("Citral 95%");
  });

  it("updates customers by name regardless of case", async () => {
    await importRows("customers", [["Name", "Phone"], ["Import Test Co", "1"]]);
    const r = await importRows("customers", [["Name", "Phone"], ["IMPORT TEST CO", "2"]]);
    expect(r.updated).toBe(1);
    expect(await db.customer.count({ where: { name: { equals: "import test co", mode: "insensitive" } } })).toBe(1);
  });

  it("saves nothing when a stock row names an unknown product", async () => {
    const before = await db.lot.count();
    const r = await importRows("stock", [
      ["Product code", "Quantity", "Cost per unit (EGP)", "Expiry date", "As of date"],
      ["IMP-2", 10, 100, "", "2025-10-01"],
      ["NOPE", 5, 50],
    ]);
    expect(r.errors).toEqual([{ row: 3, message: "No product with code NOPE. Import products first." }]);
    expect(await db.lot.count()).toBe(before);
  });

  it("creates a lot and an opening move per stock row", async () => {
    const r = await importRows("stock", [
      ["Product code", "Quantity", "Cost per unit (EGP)", "Expiry date", "As of date"],
      ["imp-2", 10, 100, "2027-06-30", "2025-10-01"],
    ]);
    expect(r.created).toBe(1);
    const lot = await db.lot.findFirstOrThrow({ where: { item: { code: "IMP-2" } }, include: { moves: true } });
    expect(Number(lot.qtyOnHand)).toBe(10);
    expect(lot.expiryDate?.toISOString().slice(0, 10)).toBe("2027-06-30");
    expect(lot.moves).toMatchObject([{ kind: "OPENING", note: "Opening stock (Excel)" }]);
  });
});
