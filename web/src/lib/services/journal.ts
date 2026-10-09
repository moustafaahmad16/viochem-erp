import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { UserError } from "./errors";
import { nextNumber } from "./numbering";

/**
 * Manual journal entries, for what no document records: capital paid in, loans, depreciation,
 * paying VAT to the tax authority, closing a year. Customers, suppliers, stock and goods in
 * transit are kept from documents, so they can't be posted to here.
 */

export type JournalInput = {
  date: Date;
  memo: string;
  createdBy: string | null;
  lines: { account: string; debit: string; credit: string; memo: string | null }[];
};

/** "L12" is a chart account, "M3" a bank account or cash box. */
const parseAccount = (v: string) => {
  const m = /^([LM])(\d+)$/.exec(v);
  if (!m) throw new UserError("Choose an account on every line.");
  return m[1] === "L" ? { ledgerAccountId: Number(m[2]) } : { moneyAccountId: Number(m[2]) };
};

export async function createJournal(input: JournalInput) {
  if (!input.memo.trim()) throw new UserError("Say what the entry is for.");
  const lines = input.lines
    .map((l) => ({ ...l, debit: new Decimal(l.debit || 0), credit: new Decimal(l.credit || 0) }))
    .filter((l) => !l.debit.isZero() || !l.credit.isZero());
  if (lines.length < 2) throw new UserError("An entry needs at least two lines.");
  for (const l of lines) {
    if (l.debit.isNeg() || l.credit.isNeg()) throw new UserError("Amounts can't be negative.");
    if (!l.debit.isZero() && !l.credit.isZero()) throw new UserError("Put each line's amount in debit or credit, not both.");
    if (l.debit.decimalPlaces() > 2 || l.credit.decimalPlaces() > 2) throw new UserError("Amounts can have at most 2 decimals.");
  }
  const debit = lines.reduce((s, l) => s.plus(l.debit), new Decimal(0));
  const credit = lines.reduce((s, l) => s.plus(l.credit), new Decimal(0));
  if (!debit.eq(credit)) throw new UserError(`Debits (${debit.toFixed(2)}) and credits (${credit.toFixed(2)}) must be equal.`);

  return db.$transaction(async (tx) => {
    const parsed = lines.map((l) => ({ ...parseAccount(l.account), debit: l.debit.toString(), credit: l.credit.toString(), memo: l.memo }));
    for (const l of parsed) {
      if ("ledgerAccountId" in l) {
        const a = await tx.ledgerAccount.findUnique({ where: { id: l.ledgerAccountId } });
        if (!a || !a.active) throw new UserError("Choose an account that is in use.");
        if (a.system) throw new UserError(`${a.code} ${a.name} is kept from documents. Record an invoice, shipment or payment instead.`);
      } else {
        const m = await tx.moneyAccount.findUnique({ where: { id: l.moneyAccountId } });
        if (!m || !m.active) throw new UserError("Choose an account that is in use.");
        if (m.currency !== "EGP") throw new UserError(`${m.name} holds ${m.currency}. Journal entries are in EGP; use a transfer or payment for foreign money.`);
      }
    }
    return tx.journalEntry.create({
      data: { number: await nextNumber(tx, "JV", input.date), date: input.date, memo: input.memo.trim(), createdBy: input.createdBy, lines: { create: parsed } },
    });
  });
}

export async function deleteJournal(id: number) {
  await db.journalEntry.delete({ where: { id } });
}

/** Accounts a manual entry can use, for the form: the chart (less what documents keep) and EGP bank and cash accounts. */
export async function journalAccountOptions() {
  const [chart, money] = await Promise.all([
    db.ledgerAccount.findMany({ where: { active: true, system: false }, orderBy: { code: "asc" } }),
    db.moneyAccount.findMany({ where: { active: true, currency: "EGP" }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
  ]);
  return [
    ...money.map((m) => ({ value: `M${m.id}`, label: m.name, group: m.kind === "CASH" ? "Cash" : "Banks" })),
    ...chart.map((a) => ({ value: `L${a.id}`, label: `${a.code} ${a.name}`, group: a.code[0] === "1" ? "Assets" : a.code[0] === "2" ? "Liabilities" : a.code[0] === "3" ? "Equity" : a.code[0] === "4" ? "Income" : "Expenses" })),
  ];
}
