import { notFound } from "next/navigation";
import { Submit } from "@/components/forms";
import { Card, PageHeader, Table } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { getT } from "@/i18n/server";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { moneyCode } from "@/lib/services/gl";
import { removeJournal } from "../../actions";
import { AccountLink, memoText } from "../../parts";

export default async function JournalEntryPage({ params }: PageProps<"/ledger/journal/[id]">) {
  const id = Number((await params).id);
  const [entry, user] = await Promise.all([
    db.journalEntry.findUnique({ where: { id }, include: { lines: { include: { ledgerAccount: true, moneyAccount: true }, orderBy: { id: "asc" } } } }),
    currentUser(),
  ]);
  const t = await getT();
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
        subtitle={`${t.date(entry.date)} · ${entry.memo}${entry.createdBy ? ` · ${t("by {name}", { name: entry.createdBy })}` : ""}`}
        back={{ href: "/ledger/journal?manual=1", label: t("Journal") }}
        actions={
          user?.role === "ADMIN" && (
            <form action={removeJournal.bind(null, entry.id)}>
              <Submit variant="danger" confirm="Delete this journal entry?">{t("Delete")}</Submit>
            </form>
          )
        }
      />
      <Card padded={false}>
        <Table
          head={<tr><th>{t("Account")}</th><th>{t("Note")}</th><th className="num">{t("Debit")}</th><th className="num">{t("Credit")}</th></tr>}
          footer={<tr><td colSpan={2}>{t("Total")}</td><td className="num">{money(total)}</td><td className="num">{money(total)}</td></tr>}
        >
          {lines.map((l) => (
            <tr key={l.id}>
              <td><span className="me-2 inline-block font-mono text-xs text-slate-400">{l.code}</span><AccountLink code={l.code}>{l.moneyAccount ? l.name : t(l.name)}</AccountLink></td>
              <td className="text-slate-600">{memoText(t, l.memo)}</td>
              <td className="num">{Number(l.debit) ? money(l.debit) : ""}</td>
              <td className="num">{Number(l.credit) ? money(l.credit) : ""}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
