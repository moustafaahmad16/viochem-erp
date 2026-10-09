import { ButtonLink, Card, RowLink, Table } from "@/components/ui";
import { addDays, today } from "@/lib/dates";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { OPEN } from "@/lib/services/cheques";
import { getT } from "@/i18n/server";
import { ChequeStatusBadge } from "./status";

/** A customer's or supplier's cheques that haven't cleared yet, with a button to add one. */
export async function PendingCheques({ customerId, supplierId }: { customerId?: number; supplierId?: number }) {
  const t = await getT();
  const cheques = await db.cheque.findMany({
    where: { status: { in: OPEN }, ...(customerId ? { customerId } : { supplierId }) },
    orderBy: [{ dueDate: "asc" }, { id: "asc" }],
  });
  const now = today();
  const week = addDays(now, 7);
  const add = customerId ? (
    <ButtonLink href={`/cheques/new?direction=received&customer=${customerId}`} variant="secondary">{t("Receive a cheque")}</ButtonLink>
  ) : (
    <ButtonLink href={`/cheques/new?direction=issued&supplier=${supplierId}`} variant="secondary">{t("Issue a cheque")}</ButtonLink>
  );
  return (
    <Card title={t("Cheques not cleared yet")} actions={add} padded={false}>
      <Table head={<tr><th>{t("Cheque no.")}</th><th>{t("Due date")}</th><th className="num">{t("Amount (EGP)")}</th></tr>} empty={t("No cheques waiting.")}>
        {cheques.map((c) => (
          <tr key={c.id}>
            <td>
              <RowLink href={`/cheques/${c.id}`}>{c.chequeNo}</RowLink>
              <div className="mt-1"><ChequeStatusBadge status={c.status} direction={c.direction} /></div>
            </td>
            <td className={c.dueDate < now ? "font-medium text-red-700" : c.dueDate <= week ? "font-medium text-amber-700" : ""}>{t.date(c.dueDate)}</td>
            <td className="num">{money(c.amount)}</td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}
