import Decimal from "decimal.js";
import type { Prisma } from "@prisma/client";
import { ButtonLink, Card, PageHeader, RowLink, Stat, Table } from "@/components/ui";
import { addDays, today } from "@/lib/dates";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { chequesDue, OPEN } from "@/lib/services/cheques";
import { getT } from "@/i18n/server";
import { ChequeStatusBadge } from "./status";

export async function generateMetadata() {
  return { title: (await getT())("Cheques") };
}

const FILTERS = [
  { key: "", label: "Pending" },
  { key: "week", label: "Due this week" },
  { key: "overdue", label: "Overdue" },
  { key: "cleared", label: "Cleared" },
  { key: "bounced", label: "Bounced" },
  { key: "all", label: "All" },
] as const;

const sum = (rows: { amount: { toString(): string } }[]) => rows.reduce((s, r) => s.plus(r.amount.toString()), new Decimal(0));

export default async function ChequesPage({ searchParams }: PageProps<"/cheques">) {
  const t = await getT();
  const sp = await searchParams;
  const direction = sp.tab === "issued" ? "ISSUED" : "RECEIVED";
  const filter = String(sp.filter ?? "");
  const now = today();
  const week = addDays(now, 7);

  const where: Prisma.ChequeWhereInput = { direction };
  if (filter === "") where.status = { in: OPEN };
  if (filter === "week") Object.assign(where, { status: { in: OPEN }, dueDate: { gte: now, lte: week } });
  if (filter === "overdue") Object.assign(where, { status: { in: OPEN }, dueDate: { lt: now } });
  if (filter === "cleared") where.status = "CLEARED";
  if (filter === "bounced") where.status = "BOUNCED";

  const [cheques, openReceived, openIssued, due] = await Promise.all([
    db.cheque.findMany({ where, include: { customer: true, supplier: true }, orderBy: [{ dueDate: filter === "all" || filter === "cleared" || filter === "bounced" ? "desc" : "asc" }, { id: "desc" }], take: 300 }),
    db.cheque.findMany({ where: { direction: "RECEIVED", status: { in: OPEN } }, select: { amount: true } }),
    db.cheque.findMany({ where: { direction: "ISSUED", status: { in: OPEN } }, select: { amount: true } }),
    chequesDue(7),
  ]);

  const href = (tab: string, f: string) => `/cheques?${new URLSearchParams({ ...(tab === "issued" ? { tab } : {}), ...(f ? { filter: f } : {}) })}`;
  const tab = direction === "ISSUED" ? "issued" : "";
  const pill = (active: boolean) => `rounded-full px-3 py-1 text-sm ${active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-200"}`;

  return (
    <>
      <PageHeader
        title={t("Cheques")}
        actions={
          <>
            <ButtonLink href="/cheques/new?direction=issued" variant="secondary">{t("Issue a cheque")}</ButtonLink>
            <ButtonLink href="/cheques/new?direction=received">{t("Receive a cheque")}</ButtonLink>
          </>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label={t("Customer cheques not cleared yet")} value={`EGP ${money(sum(openReceived))}`} hint={t("{n} cheques", { n: openReceived.length })} />
        <Stat label={t("Our cheques not cashed yet")} value={`EGP ${money(sum(openIssued))}`} hint={t("{n} cheques", { n: openIssued.length })} />
        <Stat
          label={t("Due in the next 7 days")}
          value={<span className="text-lg">{t("In: EGP {amount}", { amount: money(sum(due.received)) })}<br />{t("Out: EGP {amount}", { amount: money(sum(due.issued)) })}</span>}
          hint={t("Including any already past their date")}
          tone={due.received.length + due.issued.length > 0 ? "warn" : "default"}
        />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-4">
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
          <a href={href("", filter)} className={pill(direction === "RECEIVED")}>{t("Received cheques")}</a>
          <a href={href("issued", filter)} className={pill(direction === "ISSUED")}>{t("Issued cheques")}</a>
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <a key={f.key} href={href(tab, f.key)} className={pill(filter === f.key)}>{t(f.label)}</a>
          ))}
        </div>
      </div>
      <Card padded={false}>
        <Table
          head={
            <tr>
              <th>{t("Our number")}</th>
              <th>{t("Cheque no.")}</th>
              <th>{t("Bank")}</th>
              <th>{direction === "RECEIVED" ? t("Customer") : t("Supplier")}</th>
              <th>{t("Due date")}</th>
              <th className="num">{t("Amount (EGP)")}</th>
              <th>{t("Status")}</th>
            </tr>
          }
          empty={t("No cheques here.")}
        >
          {cheques.map((c) => {
            const open = OPEN.includes(c.status);
            const tone = open && c.dueDate < now ? "font-medium text-red-700" : open && c.dueDate <= week ? "font-medium text-amber-700" : "";
            const party = c.customer ?? c.supplier;
            return (
              <tr key={c.id} className="hover:bg-slate-50">
                <td><RowLink href={`/cheques/${c.id}`}>{c.number}</RowLink></td>
                <td className="font-mono">{c.chequeNo}</td>
                <td>{c.bank}</td>
                <td>{party && <RowLink href={c.customerId ? `/customers/${c.customerId}` : `/suppliers/${c.supplierId}`}>{party.name}</RowLink>}</td>
                <td className={tone}>{t.date(c.dueDate)}</td>
                <td className="num">{money(c.amount)}</td>
                <td><ChequeStatusBadge status={c.status} direction={c.direction} /></td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}
