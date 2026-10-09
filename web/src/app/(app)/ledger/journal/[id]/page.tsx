import { notFound } from "next/navigation";
import { Submit } from "@/components/forms";
import { Card, PageHeader, Table } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { moneyCode } from "@/lib/services/gl";
import { removeJournal } from "../../actions";
import { AccountLink } from "../../parts";

export default async function JournalEntryPage({ params }: PageProps<"/ledger/journal/[id]">) {
  const id = Number((await params).id);
  const [entry, user] = await Promise.all([
    db.journalEntry.findUnique({ where: { id }, include: { lines: { include: { ledgerAccount: true, moneyAccount: true }, orderBy: { id: "asc" } } } }),
    currentUser(),
  ]);
  if (!entry) notFound();
  const lines = entry.lines.map((l) => ({
    ...l,
    code: l.moneyAccount ? moneyCode(l.moneyAccount) : l.ledgerAccount!.code,
    name: l.moneyAccount ? l.moneyAccount.name : l.ledgerAccount!.name,
  }));
  const total = lines.reduce((s, l) => s + Number(l.debit), 0);

  return (
    <>
      <PageHeader
        title={entry.number}
        subtitle={`${formatDate(entry.date)} · ${entry.memo}${entry.createdBy ? ` · by ${entry.createdBy}` : ""}`}
        back={{ href: "/ledger/journal?manual=1", label: "Journal" }}
        actions={
          user?.role === "ADMIN" && (
            <form action={removeJournal.bind(null, entry.id)}>
              <Submit variant="danger" confirm="Delete this journal entry?">Delete</Submit>
            </form>
          )
        }
      />
      <Card padded={false}>
        <Table
          head={<tr><th>Account</th><th>Note</th><th className="num">Debit</th><th className="num">Credit</th></tr>}
          footer={<tr><td colSpan={2}>Total</td><td className="num">{money(total)}</td><td className="num">{money(total)}</td></tr>}
        >
          {lines.map((l) => (
            <tr key={l.id}>
              <td><span className="me-2 font-mono text-xs text-slate-400">{l.code}</span><AccountLink code={l.code}>{l.name}</AccountLink></td>
              <td className="text-slate-600">{l.memo}</td>
              <td className="num">{Number(l.debit) ? money(l.debit) : ""}</td>
              <td className="num">{Number(l.credit) ? money(l.credit) : ""}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
