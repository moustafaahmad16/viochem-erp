import { Badge, ButtonLink, Card, PageHeader, RowLink, Stat, Table } from "@/components/ui";
import { invoiceTotals } from "@/lib/costing";
import { today } from "@/lib/dates";
import { money, pct, qty } from "@/lib/format";
import { dashboardStats } from "@/lib/services/reports";
import { customerAccounts, supplierAccounts, totalsByCurrency } from "@/lib/services/accounts";
import Decimal from "decimal.js";
import { StatusBadge } from "./shipments/status";
import { getT } from "@/i18n/server";

export default async function Dashboard() {
  const t = await getT();
  const [s, customers, suppliers] = await Promise.all([dashboardStats(), customerAccounts(), supplierAccounts()]);
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
            <ButtonLink href="/shipments/new" variant="secondary">{t("New shipment")}</ButtonLink>
            <ButtonLink href="/invoices/new">{t("New invoice")}</ButtonLink>
          </>
        }
      />

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

      <div className="grid gap-6 lg:grid-cols-2">
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
