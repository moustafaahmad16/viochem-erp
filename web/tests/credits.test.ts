import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { parseInputDate } from "@/lib/dates";
import { buildDocument, serialize, type Party } from "@/lib/eta/document";
import { customerAccounts } from "@/lib/services/accounts";
import { addCreditLine, cancelCreditNote, createCreditNote, creditableLines, deleteCreditNote, postCreditNote } from "@/lib/services/credits";
import { generalLedger, totals, trialBalance } from "@/lib/services/gl";
import { addOpeningStock, cancelInvoice, createInvoice, postInvoice } from "@/lib/services/inventory";
import { marginReport } from "@/lib/services/reports";

// Dates in 2032 keep these document numbers and ledger totals apart from the other test files.
const d = (s: string) => parseInputDate(s)!;
const n = (v: { toString(): string }) => Number(v.toString());
const FROM = d("2032-01-01");
const TO = d("2032-12-31");

let item1: number, item2: number, customer: number, lotA: number, lotB: number, lotC: number;
let invoiceId: number, line1: number, line2: number, noteId: number;

const lotQty = async (id: number) => n((await db.lot.findUniqueOrThrow({ where: { id } })).qtyOnHand);
const gl2032 = async () => {
  const gl = await generalLedger();
  const sums = totals(gl, { from: FROM, to: TO });
  const get = (code: string) => {
    const t = sums.get(code);
    return t ? [n(t.debit), n(t.credit)] : [0, 0];
  };
  return { gl, get };
};

beforeAll(async () => {
  item1 = (await db.item.create({ data: { code: "CRN-ITEM-1", name: "Credits Linalool" } })).id;
  item2 = (await db.item.create({ data: { code: "CRN-ITEM-2", name: "Credits Vanillin" } })).id;
  customer = (await db.customer.create({ data: { name: "Credits Customer", paymentTermsDays: 30 } })).id;
  lotA = (await addOpeningStock({ itemId: item1, qty: 10, unitCostEgp: 40, date: d("2032-01-01"), expiryDate: d("2033-01-01"), supplierBatchNo: null })).id;
  lotB = (await addOpeningStock({ itemId: item1, qty: 10, unitCostEgp: 50, date: d("2032-01-01"), expiryDate: d("2034-01-01"), supplierBatchNo: null })).id;
  lotC = (await addOpeningStock({ itemId: item2, qty: 10, unitCostEgp: 100, date: d("2032-01-01"), expiryDate: null, supplierBatchNo: null })).id;

  const inv = await createInvoice(customer, d("2032-03-01"));
  invoiceId = inv.id;
  line1 = (await db.invoiceLine.create({ data: { invoiceId, itemId: item1, qty: 15, unitPrice: 100 } })).id; // 10 from A, 5 from B
  line2 = (await db.invoiceLine.create({ data: { invoiceId, itemId: item2, qty: 4, unitPrice: 200 } })).id;
  await postInvoice(invoiceId); // net 2,300 + VAT 322 = 2,622
});

describe("credit notes", () => {
  it("is only made on a posted invoice, not dated before it", async () => {
    const draftInv = await createInvoice(customer, d("2032-03-01"));
    await expect(createCreditNote(draftInv.id, d("2032-03-02"), "Test")).rejects.toThrow(/isn't posted/);
    await expect(createCreditNote(invoiceId, d("2032-02-01"), "Test")).rejects.toThrow(/before its invoice/);
    await expect(createCreditNote(invoiceId, d("2032-03-02"), " ")).rejects.toThrow(/Say why/);
  });

  it("refuses crediting more than was invoiced", async () => {
    const note = await createCreditNote(invoiceId, d("2032-03-10"), "Damaged drums and a price agreed later");
    noteId = note.id;
    expect(note.number).toBe("CRN-2032-0001");
    await expect(addCreditLine(noteId, { invoiceLineId: line1, qty: 16, restock: true })).rejects.toThrow("Only 15 kg of Credits Linalool can still be credited on this invoice.");
    await expect(addCreditLine(noteId, { invoiceLineId: line1, qty: 1, unitPrice: 101, restock: true })).rejects.toThrow(/more than the invoice price/);
    await addCreditLine(noteId, { invoiceLineId: line1, qty: 12, restock: true });
    await addCreditLine(noteId, { invoiceLineId: line2, qty: 4, unitPrice: 50, restock: false });
    await expect(addCreditLine(noteId, { invoiceLineId: line1, qty: 4, restock: true })).rejects.toThrow(/Only 3 kg/);
    const lines = await creditableLines(invoiceId, noteId);
    expect(lines.map((l) => n(l.remaining))).toEqual([3, 0]);
  });

  it("puts returned goods back into the lots they came from; price-only lines leave stock alone", async () => {
    expect([await lotQty(lotA), await lotQty(lotB), await lotQty(lotC)]).toEqual([0, 5, 6]);
    await postCreditNote(noteId);
    expect([await lotQty(lotA), await lotQty(lotB), await lotQty(lotC)]).toEqual([10, 7, 6]);
    const moves = await db.stockMove.findMany({ where: { kind: "RETURN", creditLine: { creditNoteId: noteId } }, orderBy: { id: "asc" } });
    expect(moves.map((m) => [m.lotId, n(m.qty), n(m.unitCostEgp), m.note])).toEqual([
      [lotA, 10, 40, "CRN-2032-0001"],
      [lotB, 2, 50, "CRN-2032-0001"],
    ]);

    // Another note can only credit what is left, counting the posted one.
    const other = await createCreditNote(invoiceId, d("2032-03-11"), "More");
    await expect(addCreditLine(other.id, { invoiceLineId: line1, qty: 4, restock: true })).rejects.toThrow(/Only 3 kg/);
    await expect(addCreditLine(other.id, { invoiceLineId: line2, qty: 1, restock: false })).rejects.toThrow(/Only 0 kg/);
    await deleteCreditNote(other.id);
  });

  it("reduces what the customer owes on that invoice", async () => {
    const [acc] = await customerAccounts({ id: customer });
    // Credit: 1,200 + 200 = 1,400 + VAT 196 = 1,596.
    expect(n(acc.balance)).toBe(2622 - 1596);
    expect(n(acc.bills.find((b) => b.key === `inv:${invoiceId}`)!.outstanding)).toBe(1026);
    const line = acc.statement.find((l) => l.label === "CRN-2032-0001")!;
    expect([n(line.payment), line.detail]).toEqual([1596, expect.stringMatching(/^Credit for INV-2032-/)]);
  });

  it("books returns, VAT, the customer and stock in the ledger", async () => {
    const { gl, get } = await gl2032();
    const tb = trialBalance(gl, TO);
    expect(n(tb.debit)).toBe(n(tb.credit));
    expect(get("4110")).toEqual([1400, 0]);
    expect(get("2210")).toEqual([196, 322]);
    expect(get("1210")).toEqual([2622, 1596]);
    // Opening 400 + 500 + 1,000, sold 400 + 250 + 400, returned 400 + 100.
    expect(get("1310")).toEqual([2400, 1050]);
    expect(get("5100")).toEqual([1050, 500]);
  });

  it("takes returns and allowances off the margin report", async () => {
    const byItem = await marginReport(FROM, TO, "item");
    const row = (id: number) => byItem.rows.find((r) => r.key === `i${id}`)!;
    expect([n(row(item1).qty), n(row(item1).revenue), n(row(item1).cost)]).toEqual([3, 300, 150]);
    expect([n(row(item2).qty), n(row(item2).revenue), n(row(item2).cost)]).toEqual([4, 600, 400]);
    const byCustomer = await marginReport(FROM, TO, "customer");
    const c = byCustomer.rows.find((r) => r.key === `c${customer}`)!;
    expect([n(c.revenue), n(c.cost)]).toEqual([900, 550]);
  });

  it("can't cancel the invoice while the credit note stands; cancelling the note restores everything", async () => {
    await expect(cancelInvoice(invoiceId)).rejects.toThrow("Cancel its credit notes first.");
    await cancelCreditNote(noteId);
    expect([await lotQty(lotA), await lotQty(lotB), await lotQty(lotC)]).toEqual([0, 5, 6]);
    expect(await db.stockMove.count({ where: { kind: "RETURN", creditLine: { creditNoteId: noteId } } })).toBe(0);
    const [acc] = await customerAccounts({ id: customer });
    expect(n(acc.balance)).toBe(2622);
    const { get } = await gl2032();
    expect(get("4110")).toEqual([0, 0]);
    await expect(cancelCreditNote(noteId)).rejects.toThrow(/Only posted/);
    await cancelInvoice(invoiceId);
    expect([await lotQty(lotA), await lotQty(lotB)]).toEqual([10, 10]);
  });

  it("refuses to cancel when the returned goods have been sold again", async () => {
    const inv = await createInvoice(customer, d("2032-05-01"));
    const l = await db.invoiceLine.create({ data: { invoiceId: inv.id, itemId: item2, qty: 2, unitPrice: 200, lotId: lotC } });
    await postInvoice(inv.id);
    const note = await createCreditNote(inv.id, d("2032-05-02"), "Returned");
    await addCreditLine(note.id, { invoiceLineId: l.id, qty: 2, restock: true });
    await postCreditNote(note.id);
    expect(await lotQty(lotC)).toBe(10);
    await db.lot.update({ where: { id: lotC }, data: { qtyOnHand: 1 } });
    await expect(cancelCreditNote(note.id)).rejects.toThrow(/no longer has/);
  });
});

describe("ETA credit note documents", () => {
  const party: Party = { type: "B", id: "100324932", name: "VIOCHEM", country: "EG", governate: "Cairo", city: "Nasr City", street: "Abbas El Akkad", buildingNo: "12", branchId: "0" };
  const base = {
    issuer: party,
    receiver: { ...party, branchId: undefined },
    internalId: "CRN-2032-0001",
    dateTimeIssued: "2032-03-10T08:00:00Z",
    activityCode: "4669",
    version: "1.0",
    lines: [{ description: "Linalool", itemType: "EGS", itemCode: "EG-1", unitType: "KGM", internalCode: "LIN", qty: 1, unitPrice: 100, vatRate: 14 }],
  };

  it("lists the invoices it corrects, and signs them", () => {
    const doc = buildDocument({ ...base, documentType: "C", references: ["UUID-OF-INVOICE"] });
    expect(doc.documentType).toBe("C");
    expect(doc).toMatchObject({ references: ["UUID-OF-INVOICE"] });
    expect(Object.keys(doc).indexOf("references")).toBe(Object.keys(doc).indexOf("documentTypeVersion") + 1);
    expect(serialize(doc)).toContain('"REFERENCES""REFERENCES""UUID-OF-INVOICE"');
    expect("references" in buildDocument(base)).toBe(false);
  });
});
