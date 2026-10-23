import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { parseInputDate } from "@/lib/dates";
import { invoiceTotals } from "@/lib/costing";
import { customerAccounts } from "@/lib/services/accounts";
import { addCreditLine, createCreditNote, postCreditNote } from "@/lib/services/credits";
import { generalLedger, totals } from "@/lib/services/gl";
import { addOpeningStock, createInvoice, postInvoice } from "@/lib/services/inventory";
import { recordCustomerPayment } from "@/lib/services/payments";
import { withholdingReport } from "@/lib/services/reports";

// 2020 dates keep these books apart from the other test files, which share the database.
const d = (s: string) => parseInputDate(s)!;
const n = (v: { toString(): string }) => Number(v.toString());
let customer: number, invoiceId: number;

beforeAll(async () => {
  customer = (await db.customer.create({ data: { name: "WHT Customer", taxId: "300111222" } })).id;
  const item = (await db.item.create({ data: { code: "WHT-ITEM", name: "Hedione" } })).id;
  await addOpeningStock({ itemId: item, qty: 100, unitCostEgp: 500, date: d("2020-01-01"), expiryDate: null, supplierBatchNo: null });
  const inv = await createInvoice(customer, d("2020-02-01"), { whtRate: 1 });
  await db.invoiceLine.create({ data: { invoiceId: inv.id, itemId: item, qty: 100, unitPrice: 1000 } });
  await postInvoice(inv.id);
  invoiceId = inv.id;
});

describe("withholding tax (WHT)", () => {
  it("is 1% of the amount before VAT, taken off what the customer owes", () => {
    const t = invoiceTotals([{ qty: 100, unitPrice: 1000 }], 14, 1);
    expect([t.net, t.vat, t.total, t.wht, t.due].map(n)).toEqual([100000, 14000, 114000, 1000, 113000]);
    expect(n(invoiceTotals([{ qty: 1, unitPrice: 100 }], 14).due)).toBe(114);
  });

  it("leaves the customer owing the total less the tax, and books the tax as withheld", async () => {
    const [acc] = await customerAccounts({ id: customer });
    expect(n(acc.balance)).toBe(113000);
    await recordCustomerPayment(customer, { invoiceId, accountId: null, date: d("2020-03-01"), amount: "113000", method: "BANK_TRANSFER", reference: null, notes: null });
    const [paid] = await customerAccounts({ id: customer });
    expect(n(paid.balance)).toBe(0);
    const t = totals(await generalLedger(), { to: d("2020-12-31") });
    const balance = (code: string) => n(t.get(code)!.debit.minus(t.get(code)!.credit));
    expect(balance("1430")).toBe(1000);
  });

  it("gives back the tax on a credit note, and reports what was withheld", async () => {
    const line = await db.invoiceLine.findFirstOrThrow({ where: { invoiceId } });
    const cn = await createCreditNote(invoiceId, d("2020-03-10"), "Returned");
    expect(n(cn.whtRate)).toBe(1);
    await addCreditLine(cn.id, { invoiceLineId: line.id, qty: 10, restock: true });
    await postCreditNote(cn.id);
    const [acc] = await customerAccounts({ id: customer });
    expect(n(acc.balance)).toBe(-11300); // 11,400 credited less the 100 of tax the customer kept
    const { rows, total } = await withholdingReport(d("2020-01-01"), d("2020-03-31"));
    expect(rows.map((r) => [r.name, n(r.net), n(r.wht)])).toEqual([["WHT Customer", 90000, 900]]);
    expect(n(total.wht)).toBe(900);
  });
});
