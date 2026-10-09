import { Badge, ButtonLink, Card, PageHeader, RowLink, Stat, Table } from "@/components/ui";
import { invoiceTotals } from "@/lib/costing";
import { today } from "@/lib/dates";
import { money, pct, qty } from "@/lib/format";
import { dashboardStats } from "@/lib/services/reports";
import { customerAccounts, supplierAccounts, totalsByCurrency } from "@/lib/services/accounts";
import Decimal from "decimal.js";
import { StatusBadge } from "./shipments/status";
import { getT } from "@/i18n/server";
import { lowStock } from "@/lib/services/alerts";
import { chequesDue } from "@/lib/services/cheques";
import { dailyBudget } from "@/lib/services/rankings";
import { ExportButtons } from "@/components/export-buttons";

export default async function Dashboard() {
  const t = await getT();
  const [s, customers, suppliers, due, low, budget] = await Promise.all([dashboardStats(), customerAccounts(), supplierAccounts(), chequesDue(7), lowStock(), dailyBudget()]);
  const sum = (cs: { amount: { toString(): string } }[]) => cs.reduce((total, c) => total.plus(c.amount.toString()), new Decimal(0));
  const dueCheques = [...due.received.map((c) => ({ ...c, party: c.customer?.name ?? "" })), ...due.issued.map((c) => ({ ...c, party: c.supplier?.name ?? "" }))].sort(
    (a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.id - b.id,
  );
  const owedToUs = customers.reduce((sum, a) => sum.plus(Decimal.max(a.balance, 0)), new Decimal(0));
  const overdueToUs = customers.reduce((sum, a) => sum.plus(a.overdue), new Decimal(0));
  const weOwe = totalsByCurrency(suppliers.flatMap((x) => x.accounts).filter((a) => a.balance.gt(0)));
  const now = today();
  const month = t(now.toLocaleString("en-US", { month: "long", timeZone: "UTC" }));

  return (
    <>
      <PageHeader
        title={t("Dashboard")}
        subtitle={t.date(now)}
        actions={
          <>
            <ExportButtons report="dashboard" />
            <ButtonLink href="/shipments/new" variant="secondary">{t("New shipment")}</ButtonLink>
            <ButtonLink href="/invoices/new">{t("New invoice")}</ButtonLink>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {budget.periods.map((p) => (
          <Stat
            key={p.key}
            label={t("Net profit {period}", { period: t(p.label).toLowerCase() })}
            value={<span dir="ltr">EGP {money(p.netProfit, 0)}</span>}
            tone={p.netProfit.lt(0) ? "warn" : p.netProfit.gt(0) ? "good" : "default"}
            hint={t("Sales {sales} · gross profit {gross}", { sales: money(p.sales, 0), gross: money(p.grossProfit, 0) })}
          />
        ))}
        <Stat
          label={t("Cash and banks")}
          value={`EGP ${money(budget.cash.total, 0)}`}
          hint={<RowLink href="/accounts">{t("{n} accounts", { n: budget.cash.rows.length })}</RowLink>}
        />
      </div>

      <Card title={t("Daily budget")} actions={<span className="text-xs text-slate-500">{t("Foreign currency at the latest shipment rate.")}</span>} padded={false} className="mb-6">
        <div className="grid lg:grid-cols-5">
          <div className="border-slate-100 lg:col-span-3 lg:border-e">
            <Table
              head={<tr><th>{t("Account")}</th><th className="num">{t("Balance")}</th><th className="num">{t("Balance (EGP)")}</th></tr>}
              empty={t("Add your bank accounts and cash box")}
              footer={budget.cash.rows.length > 0 && <tr><td>{t("Total")}</td><td /><td className="num">{money(budget.cash.total, 0)}</td></tr>}
            >
              {budget.cash.rows.map((r) => (
                <tr key={r.id}>
                  <td><RowLink href={`/accounts/${r.id}`}>{r.name}</RowLink><span className="ms-2 text-xs text-slate-500">{t(r.kind === "BANK" ? "Bank" : "Cash")}</span></td>
                  <td className={`num ${r.balance.lt(0) ? "text-red-700" : ""}`}>{r.currency} {money(r.balance)}</td>
                  <td className="num">{r.egp ? money(r.egp, 0) : <span className="text-xs text-amber-700">{t("No rate yet")}</span>}</td>
                </tr>
              ))}
            </Table>
          </div>
          <dl className="space-y-2.5 p-5 text-sm lg:col-span-2">
            {[
              { label: "Cash and banks", value: budget.cash.total, href: "/accounts" },
              { label: "Stock at landed cost", value: budget.stockValue, href: "/stock" },
              { label: "Customers owe you", value: budget.receivable, href: "/receivables" },
              { label: "You owe suppliers", value: budget.payable.neg(), href: "/payables" },
            ].map((x) => (
              <div key={x.label} className="flex justify-between gap-4">
                <dt><a href={x.href} className="text-slate-600 hover:underline">{t(x.label)}</a></dt>
                <dd dir="ltr" className={`num ${x.value.lt(0) ? "text-red-700" : ""}`}>{x.value.lt(0) ? "−" : ""}{money(x.value.abs(), 0)}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4 border-t border-slate-200 pt-2.5 font-semibold">
              <dt>{t("Net position")}</dt>
              <dd dir="ltr" className="num">EGP {money(budget.net, 0)}</dd>
            </div>
          </dl>
        </div>
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("Sales in {month}", { month })} value={`EGP ${money(s.salesThisMonth, 0)}`} hint={t("Before VAT")} />
        <Stat label={t("Gross margin in {month}", { month })} value={`EGP ${money(s.marginThisMonth, 0)}`} hint={s.salesThisMonth.isZero() ? t("No sales yet") : t("{pct} of sales", { pct: pct(s.marginPctThisMonth) })} tone="good" />
        <Stat label={t("Stock value")} value={`EGP ${money(s.stockValue, 0)}`} hint={t("At landed cost")} />
        <Stat label={t("Lots expiring in 90 days")} value={s.expiring.length} tone={s.expiring.length ? "warn" : "default"} hint={<RowLink href="/reports/expiry">{t("See them")}</RowLink>} />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("Customers owe you")} value={`EGP ${money(owedToUs, 0)}`} hint={<RowLink href="/receivables">{t("By customer")}</RowLink>} />
        <Stat label={t("Overdue from customers")} value={`EGP ${money(overdueToUs, 0)}`} tone={overdueToUs.gt(0) ? "warn" : "default"} hint={t("{n} customers late", { n: customers.filter((a) => a.overdue.gt(0)).length })} />
        <Stat label={t("You owe suppliers")} value={weOwe.length ? weOwe.map((w) => <div key={w.currency}>{w.currency} {money(w.balance, 0)}</div>) : t("Nothing")} hint={<RowLink href="/payables">{t("By supplier")}</RowLink>} />
        <Stat
          label={t("Overdue to suppliers")}
          value={weOwe.some((w) => w.overdue.gt(0)) ? weOwe.filter((w) => w.overdue.gt(0)).map((w) => <div key={w.currency}>{w.currency} {money(w.overdue, 0)}</div>) : t("None")}
          tone={weOwe.some((w) => w.overdue.gt(0)) ? "warn" : "default"}
        />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat
          label={t("Cheques to collect in 7 days")}
          value={`EGP ${money(sum(due.received), 0)}`}
          tone={due.received.length ? "warn" : "default"}
          hint={<RowLink href="/cheques?tab=received">{t("{n} cheques", { n: due.received.length })}</RowLink>}
        />
        <Stat
          label={t("Cheques to pay in 7 days")}
          value={`EGP ${money(sum(due.issued), 0)}`}
          tone={due.issued.length ? "warn" : "default"}
          hint={<RowLink href="/cheques?tab=issued">{t("{n} cheques", { n: due.issued.length })}</RowLink>}
        />
        <Stat
          label={t("Products running low")}
          value={low.length}
          tone={low.some((r) => r.short.gt(0)) ? "warn" : "default"}
          hint={<RowLink href="/reports/low-stock">{low.some((r) => r.short.gt(0)) ? t("{n} still to order", { n: low.filter((r) => r.short.gt(0)).length }) : t("See them")}</RowLink>}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {dueCheques.length > 0 && (
          <Card title={t("Cheques due in 7 days")} actions={<RowLink href="/cheques">{t("All")}</RowLink>} padded={false} className="lg:col-span-2">
            <Table head={<tr><th>{t("Cheque")}</th><th>{t("From or to")}</th><th>{t("Due")}</th><th className="num">{t("Amount (EGP)")}</th></tr>}>
              {dueCheques.map((c) => (
                <tr key={c.id}>
                  <td><RowLink href={`/cheques/${c.id}`}>{c.chequeNo}</RowLink>{c.bank && <span className="ms-2 inline-block text-xs text-slate-500">{c.bank}</span>}</td>
                  <td>{c.direction === "RECEIVED" ? t("From {name}", { name: c.party }) : t("To {name}", { name: c.party })}</td>
                  <td className={c.dueDate < now ? "font-medium text-red-700" : ""}>{t.date(c.dueDate)}</td>
                  <td className={`num ${c.direction === "ISSUED" ? "text-slate-600" : ""}`}>{c.direction === "ISSUED" ? "−" : ""}{money(c.amount)}</td>
                </tr>
              ))}
            </Table>
          </Card>
        )}
        <Card title={t("Shipments on the way")} actions={<RowLink href="/shipments">{t("All")}</RowLink>} padded={false}>
          <Table head={<tr><th>{t("Shipment")}</th><th>{t("Supplier")}</th><th>{t("ETA")}</th><th>{t("Status")}</th></tr>} empty={t("Nothing on the way.")}>
            {s.openShipments.map((sh) => {
              const late = sh.eta && sh.eta < now;
              return (
                <tr key={sh.id}>
                  <td><RowLink href={`/shipments/${sh.id}`}>{sh.ref}</RowLink></td>
                  <td>{sh.supplier.name}</td>
                  <td className={late ? "font-medium text-amber-700" : ""}>{t.date(sh.eta)}{late && ` · ${t("late")}`}</td>
                  <td><StatusBadge status={sh.status} /></td>
                </tr>
              );
            })}
          </Table>
        </Card>

        <Card title={t("Best sellers in {month}", { month })} actions={<RowLink href="/reports/margin">{t("Margins")}</RowLink>} padded={false}>
          <Table head={<tr><th>{t("Product")}</th><th className="num">{t("Sales")}</th><th className="num">{t("Margin")}</th></tr>} empty={t("No sales this month yet.")}>
            {s.topItems.map((r) => (
              <tr key={r.key}>
                <td>{r.label}</td>
                <td className="num">{money(r.revenue, 0)}</td>
                <td className="num">{pct(r.marginPct)}</td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title={t("Latest invoices")} actions={<RowLink href="/invoices">{t("All")}</RowLink>} padded={false}>
          <Table head={<tr><th>{t("Invoice")}</th><th>{t("Customer")}</th><th>{t("Date")}</th><th className="num">{t("Total")}</th></tr>} empty={t("No invoices yet.")}>
            {s.recentInvoices.map((i) => (
              <tr key={i.id}>
                <td><RowLink href={`/invoices/${i.id}`}>{i.number}</RowLink></td>
                <td>{i.customer.name}</td>
                <td>{t.date(i.date)}</td>
                <td className="num">{money(invoiceTotals(i.lines, i.vatRate.toString()).total, 0)}</td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title={t("Expiring soon")} actions={<RowLink href="/reports/expiry">{t("All")}</RowLink>} padded={false}>
          <Table head={<tr><th>{t("Lot")}</th><th>{t("Product")}</th><th>{t("Expiry")}</th><th className="num">{t("On hand")}</th></tr>} empty={t("No lots expire in the next 90 days.")}>
            {s.expiring.slice(0, 6).map((l) => (
              <tr key={l.id}>
                <td><RowLink href={`/stock/lots/${l.id}`}>{l.lotNo}</RowLink></td>
                <td>{l.item.name}</td>
                <td>{l.expiryDate! < now ? <Badge color="red">{t("Expired")}</Badge> : t.date(l.expiryDate)}</td>
                <td className="num">{qty(l.qtyOnHand)} {l.item.unit}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
