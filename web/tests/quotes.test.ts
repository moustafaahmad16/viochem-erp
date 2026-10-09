import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { parseInputDate } from "@/lib/dates";
import { addQuoteLine, createQuote, declineQuote, isExpired, quoteToInvoice, reopenQuote, updateQuote } from "@/lib/services/quotes";

// Dates in 2031 keep these document numbers apart from the other test files.
const d = (s: string) => parseInputDate(s)!;
const n = (v: { toString(): string }) => Number(v.toString());

let itemA: number, itemB: number, customer: number;

beforeAll(async () => {
  itemA = (await db.item.create({ data: { code: "QUO-ITEM-A", name: "Quotes Linalool" } })).id;
  itemB = (await db.item.create({ data: { code: "QUO-ITEM-B", name: "Quotes Geraniol" } })).id;
  customer = (await db.customer.create({ data: { name: "Quotes Customer" } })).id;
});

describe("quotations", () => {
  it("numbers them QUO and is valid for 30 days by default", async () => {
    const q = await createQuote(customer, d("2031-01-10"), null);
    expect(q.number).toMatch(/^QUO-2031-\d{4}$/);
    expect(q.status).toBe("OPEN");
    expect(q.validUntil?.toISOString().slice(0, 10)).toBe("2031-02-09");
    const q2 = await createQuote(customer, d("2031-01-10"), d("2031-01-20"));
    expect(q2.validUntil?.toISOString().slice(0, 10)).toBe("2031-01-20");
    await expect(createQuote(customer, d("2031-01-10"), d("2031-01-01"))).rejects.toThrow(/before the quotation date/);
  });

  it("turns into a draft invoice with the same products, prices and VAT", async () => {
    const q = await createQuote(customer, d("2031-02-01"), null);
    await updateQuote(q.id, { customerId: customer, date: d("2031-02-01"), validUntil: d("2031-03-01"), vatRate: "5", notes: "Delivery in 2 weeks" });
    await addQuoteLine(q.id, { itemId: itemA, qty: "10", unitPrice: "250.5" });
    await addQuoteLine(q.id, { itemId: itemB, qty: "2.5", unitPrice: "1000" });

    const inv = await quoteToInvoice(q.id);
    const full = await db.invoice.findUniqueOrThrow({ where: { id: inv.id }, include: { lines: { orderBy: { id: "asc" } }, quote: true } });
    expect(full.status).toBe("DRAFT");
    expect(full.number).toMatch(/^INV-\d{4}-\d{4}$/);
    expect(full.customerId).toBe(customer);
    expect(n(full.vatRate)).toBe(5);
    expect(full.notes).toBe("Delivery in 2 weeks");
    expect(full.lines.map((l) => [l.itemId, n(l.qty), n(l.unitPrice), l.lotId])).toEqual([
      [itemA, 10, 250.5, null],
      [itemB, 2.5, 1000, null],
    ]);
    expect(full.quote?.id).toBe(q.id);

    const after = await db.quote.findUniqueOrThrow({ where: { id: q.id } });
    expect(after.status).toBe("ACCEPTED");
    expect(after.invoiceId).toBe(inv.id);

    await expect(quoteToInvoice(q.id)).rejects.toThrow(/Only open quotations/);
    await expect(addQuoteLine(q.id, { itemId: itemA, qty: "1", unitPrice: "1" })).rejects.toThrow(/Only open quotations/);
  });

  it("refuses an empty quotation, and a declined one until reopened", async () => {
    const q = await createQuote(customer, d("2031-03-01"), null);
    await expect(quoteToInvoice(q.id)).rejects.toThrow(/Add products/);
    expect(await db.quote.findUniqueOrThrow({ where: { id: q.id } })).toMatchObject({ status: "OPEN", invoiceId: null });

    await addQuoteLine(q.id, { itemId: itemA, qty: "1", unitPrice: "100" });
    await declineQuote(q.id);
    await expect(quoteToInvoice(q.id)).rejects.toThrow(/Only open quotations/);
    await reopenQuote(q.id);
    await expect(quoteToInvoice(q.id)).resolves.toBeTruthy();
  });

  it("still converts an expired quotation", async () => {
    const q = await createQuote(customer, d("2031-04-01"), d("2031-04-02"));
    await addQuoteLine(q.id, { itemId: itemB, qty: "1", unitPrice: "50" });
    expect(isExpired(q, d("2031-04-03"))).toBe(true);
    expect(isExpired(q, d("2031-04-02"))).toBe(false);
    await expect(quoteToInvoice(q.id)).resolves.toBeTruthy();
  });
});
