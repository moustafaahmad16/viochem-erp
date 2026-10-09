import Link from "next/link";
import { ButtonLink, Card, PageHeader } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { formatDate, today } from "@/lib/dates";
import { money } from "@/lib/format";
import { generalLedger } from "@/lib/services/gl";
import { AccountLink, DateFilter, dateParam } from "../parts";

export const metadata = { title: "Journal" };

export default async function JournalPage({ searchParams }: PageProps<"/ledger/journal">) {
  const sp = await searchParams;
  const now = today();
  const from = dateParam(sp.from, new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  const to = dateParam(sp.to, now);
  const manualOnly = sp.manual === "1";
  const [gl, user] = await Promise.all([generalLedger(), currentUser()]);
  const names = new Map(gl.accounts.map((a) => [a.code, a.name]));
  const entries = gl.entries.filter((e) => e.date >= from && e.date <= to && (!manualOnly || e.manualId)).reverse();
  const qs = (manual: boolean) => `?from=${sp.from ?? ""}&to=${sp.to ?? ""}${manual ? "&manual=1" : ""}`;

  return (
    <>
      <PageHeader
        title="Journal"
        subtitle="Every entry in the books. Documents post their own entries; manual entries cover the rest."
        back={{ href: "/ledger", label: "Chart of accounts" }}
        actions={user?.role === "ADMIN" ? <ButtonLink href="/ledger/journal/new">New journal entry</ButtonLink> : undefined}
      />
      <Card className="mb-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <DateFilter from={from} to={to} />
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
            <Link href={qs(false)} className={`rounded-md px-3 py-1 ${manualOnly ? "text-slate-600" : "bg-white font-medium shadow-sm"}`}>All</Link>
            <Link href={qs(true)} className={`rounded-md px-3 py-1 ${manualOnly ? "bg-white font-medium shadow-sm" : "text-slate-600"}`}>Manual only</Link>
          </div>
        </div>
      </Card>
      <div className="space-y-3">
        {!entries.length && <Card><p className="text-sm text-slate-500">No entries in these dates.</p></Card>}
        {entries.map((e, i) => (
          <Card key={`${e.ref}-${i}`} padded={false}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 px-5 py-2.5 text-sm">
              <div>
                <span className="text-slate-500">{formatDate(e.date)}</span>
                <span className="mx-2">·</span>
                {e.href ? <Link href={e.href} className="font-medium text-brand-700 hover:underline">{e.ref}</Link> : <span className="font-medium">{e.ref}</span>}
                <span className="ml-2 text-slate-600">{e.memo}</span>
              </div>
              {e.manualId && <span className="text-xs font-medium text-accent-700">Manual</span>}
            </div>
            <table className="w-full text-sm">
              <tbody>
                {e.lines.map((l, j) => (
                  <tr key={j} className="border-b border-slate-50 last:border-0">
                    <td className={`py-1.5 ${l.credit.isZero() ? "pl-5" : "pl-12"}`}>
                      <span className="mr-2 font-mono text-xs text-slate-400">{l.code}</span>
                      <AccountLink code={l.code}>{names.get(l.code) ?? l.code}</AccountLink>
                      {l.memo && <span className="ml-2 text-xs text-slate-500">{l.memo}</span>}
                    </td>
                    <td className="num w-36 py-1.5">{l.debit.isZero() ? "" : money(l.debit)}</td>
                    <td className="num w-36 py-1.5 pr-5">{l.credit.isZero() ? "" : money(l.credit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}
      </div>
    </>
  );
}
