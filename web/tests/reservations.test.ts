import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { parseInputDate } from "@/lib/dates";
import { CODES, generalLedger, totals } from "@/lib/services/gl";
import { addOpeningStock, createInvoice, postInvoice } from "@/lib/services/inventory";
import { invoiceNumbering, setTaxedStart } from "@/lib/services/invoice-numbers";
import { addQuoteLine, confirmQuote, createQuote, declineQuote, editQuote, quoteToInvoice, updateQuoteLine } from "@/lib/services/quotes";
import { availability, reservationsFor, shortages } from "@/lib/services/reservations";
import { textToSign } from "@/lib/services/einvoice";

// Valid-until dates far ahead keep these quotations reserving whatever day the tests run.
const d = (s: string) => parseInputDate(s)!;
const num = (v: { toString(): string }) => Number(v.toString());
const FAR = d("2099-12-31");

let item: number, customer: number;
const stock = async () => {
  const a = (await availability([item])).get(item)!;
  return [num(a.onHand), num(a.reserved), num(a.free)];
};

beforeAll(async () => {
  item = (await db.item.create({ data: { code: "RES-GER", name: "Reserved Geraniol" } })).id;
  customer = (await db.customer.create({ data: { name: "Reserving Customer" } })).id;
  await addOpeningStock({ itemId: item, qty: 100, unitCostEgp: 50, date: d("2026-01-01"), expiryDate: null, supplierBatchNo: null });
});

describe("reserving stock", () => {
  it("reserves a confirmed quotation's products, and releases them when edited or declined", async () => {
    const q = await createQuote(customer, d("2026-02-01"), FAR);
    await addQuoteLine(q.id, { itemId: item, qty: "30", unitPrice: "80" });
    expect(await stock()).toEqual([100, 0, 100]);

    await confirmQuote(q.id);
    expect(await stock()).toEqual([100, 30, 70]);
    expect((await reservationsFor(item)).map((r) => [r.number, num(r.qty)])).toEqual([[q.number, 30]]);
    // Confirmed lines are fixed until the quotation is opened for changes again.
    await expect(updateQuoteLine(q.id, (await db.quoteLine.findFirstOrThrow({ where: { quoteId: q.id } })).id, { qty: "40", unitPrice: "80" })).rejects.toThrow("Only open quotations can be changed.");

    await editQuote(q.id);
    expect(await stock()).toEqual([100, 0, 100]);
    await confirmQuote(q.id);
    await declineQuote(q.id);
    expect(await stock()).toEqual([100, 0, 100]);
  });

  it("refuses to confirm more than is free, unless allowed", async () => {
    const first = await createQuote(customer, d("2026-02-02"), FAR);
    await addQuoteLine(first.id, { itemId: item, qty: "60", unitPrice: "80" });
    await confirmQuote(first.id);

    const second = await createQuote(customer, d("2026-02-03"), FAR);
    await addQuoteLine(second.id, { itemId: item, qty: "25", unitPrice: "80" });
    await addQuoteLine(second.id, { itemId: item, qty: "25", unitPrice: "75" });
    await expect(confirmQuote(second.id)).rejects.toThrow("Only 40 kg of Reserved Geraniol is free (100 kg on hand, 60 kg reserved), but 50 kg is needed.");
    expect(await confirmQuote(second.id, { allowShort: true })).toHaveLength(1);
    expect(await stock()).toEqual([100, 110, -10]);
    await declineQuote(second.id);
  });

  it("stops reserving once the valid-until date has passed", async () => {
    const q = await db.quote.findFirstOrThrow({ where: { status: "CONFIRMED", customerId: customer } });
    const after = (await availability([item], {}, d("2100-01-01"))).get(item)!;
    expect(num(after.reserved)).toBe(0);
    expect(num((await availability([item], {}, q.date)).get(item)!.reserved)).toBe(60);
  });

  it("moves the reservation to the draft invoice, which can still change, and posting takes the stock", async () => {
    const q = await db.quote.findFirstOrThrow({ where: { status: "CONFIRMED", customerId: customer } });
    const inv = await quoteToInvoice(q.id, "NON_TAXED");
    expect([inv.kind, num(inv.vatRate), inv.number]).toEqual(["NON_TAXED", 0, `DRAFT-${inv.id}`]);
    expect(await stock()).toEqual([100, 60, 40]);

    // Another draft for more than is free is flagged when posting.
    const other = await createInvoice(customer, d("2026-03-01"));
    await db.invoiceLine.create({ data: { invoiceId: other.id, itemId: item, qty: 50, unitPrice: 90 } });
    const lines = await db.invoiceLine.findMany({ where: { invoiceId: other.id }, include: { item: true } });
    expect(await shortages(lines, { invoiceId: other.id })).toEqual(["Only 40 kg of Reserved Geraniol is free (100 kg on hand, 60 kg reserved), but 50 kg is needed."]);
    await db.invoice.delete({ where: { id: other.id } });

    await db.invoiceLine.updateMany({ where: { invoiceId: inv.id }, data: { qty: 55 } });
    await postInvoice(inv.id);
    expect(await stock()).toEqual([45, 0, 45]);
  });
});

describe("taxed and non-taxed invoices", () => {
  const sell = async (kind: "TAXED" | "NON_TAXED", number?: string) => {
    const inv = await createInvoice(customer, d("2026-04-01"), { kind, number, whtRate: 1 });
    await db.invoiceLine.create({ data: { invoiceId: inv.id, itemId: item, qty: 1, unitPrice: 100 } });
    return postInvoice(inv.id);
  };

  it("numbers taxed invoices from the start number, which then locks, and non-taxed ones NT-0, NT-1…", async () => {
    // Start the taxed series afresh: other test files have posted taxed invoices already.
    // The non-taxed series began with the invoice made from the quotation above.
    await db.counter.deleteMany({ where: { key: { in: ["TAXED", "TAXED-START"] } } });
    await setTaxedStart(1001);
    expect(await invoiceNumbering()).toMatchObject({ nextTaxed: 1001, locked: false, nextNonTaxed: "NT-1" });

    expect((await sell("TAXED")).number).toBe("1001");
    expect((await sell("NON_TAXED")).number).toBe("NT-1");
    expect((await sell("NON_TAXED")).number).toBe("NT-2");
    // A number typed by hand is kept and doesn't move the series; one already taken is skipped.
    expect((await sell("TAXED", "1003")).number).toBe("1003");
    expect((await sell("TAXED")).number).toBe("1002");
    expect((await sell("TAXED")).number).toBe("1004");

    await expect(setTaxedStart(5000)).rejects.toThrow("can't change");
    expect(await invoiceNumbering()).toMatchObject({ taxedStart: 1001, nextTaxed: 1005, locked: true, nextNonTaxed: "NT-3" });
  });

  it("carries no VAT or withholding tax when non-taxed, books to its own sales account, and never goes to ETA", async () => {
    const nt = await db.invoice.findUniqueOrThrow({ where: { number: "NT-1" } });
    expect([num(nt.vatRate), num(nt.whtRate)]).toEqual([0, 0]);
    const day = d("2026-04-01");
    const sums = totals(await generalLedger(), { from: day, to: day });
    // The two non-taxed sales of EGP 100 each, with no VAT.
    expect(sums.get(CODES.salesNonTaxed)?.credit.toString()).toBe("200");
    // VAT comes only from the four taxed ones.
    expect(num(sums.get(CODES.vatOut)!.credit)).toBe(56);
    await expect(textToSign("invoice", nt.id)).rejects.toThrow("Non-taxed invoices aren't sent to the tax authority.");
  });

  it("refuses a typed number that looks like a draft's", async () => {
    await expect(createInvoice(customer, d("2026-04-02"), { number: "DRAFT-9" })).rejects.toThrow(/can't start with DRAFT-/);
  });
});
