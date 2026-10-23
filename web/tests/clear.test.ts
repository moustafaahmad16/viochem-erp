import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { parseInputDate } from "@/lib/dates";
import { clearAllData } from "@/lib/services/clear";
import { addOpeningStock, createInvoice, postInvoice } from "@/lib/services/inventory";

class Rollback extends Error {}

describe("clearing all data", () => {
  it("removes products, customers and invoices, keeping users and the chart of accounts", async () => {
    const d = (s: string) => parseInputDate(s)!;
    await db.user.create({ data: { email: "clear@test", name: "Admin", role: "ADMIN", passwordHash: "x" } });
    const item = await db.item.create({ data: { code: "CLR", name: "Citral" } });
    const customer = await db.customer.create({ data: { name: "Clear Co" } });
    await addOpeningStock({ itemId: item.id, qty: 5, unitCostEgp: 100, date: d("2026-01-01"), expiryDate: null, supplierBatchNo: null });
    const inv = await createInvoice(customer.id, d("2026-01-02"));
    await db.invoiceLine.create({ data: { invoiceId: inv.id, itemId: item.id, qty: 1, unitPrice: 200 } });
    await postInvoice(inv.id);
    const accounts = await db.ledgerAccount.count();

    // Run inside a transaction that is rolled back, so the other tests' data stays.
    await expect(
      db.$transaction(async (tx) => {
        await clearAllData(tx);
        expect(await Promise.all([tx.item.count(), tx.customer.count(), tx.invoice.count(), tx.lot.count(), tx.stockMove.count(), tx.counter.count()])).toEqual([0, 0, 0, 0, 0, 0]);
        expect(await tx.user.count({ where: { email: "clear@test" } })).toBe(1);
        expect(await tx.ledgerAccount.count()).toBe(accounts);
        throw new Rollback();
      }, { timeout: 60_000 }),
    ).rejects.toThrow(Rollback);
    expect(await db.invoice.count({ where: { id: inv.id } })).toBe(1);
  });
});
