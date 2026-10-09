import { Badge, ButtonLink, Card, PageHeader, RowLink, Stat, Table } from "@/components/ui";
import { invoiceTotals } from "@/lib/costing";
import { formatDate, today } from "@/lib/dates";
import { money, pct, qty } from "@/lib/format";
import { dashboardStats } from "@/lib/services/reports";
import { customerAccounts, supplierAccounts, totalsByCurrency } from "@/lib/services/accounts";
import Decimal from "decimal.js";
import { StatusBadge } from "./shipments/status";

export default async function Dashboard() {
  const [s, customers, suppliers] = await Promise.all([dashboardStats(), customerAccounts(), supplierAccounts()]);
  const owedToUs = customers.reduce((t, a) => t.plus(Decimal.max(a.balance, 0)), new Decimal(0));
  const overdueToUs = customers.reduce((t, a) => t.plus(a.overdue), new Decimal(0));
  const weOwe = totalsByCurrency(suppliers.flatMap((x) => x.accounts).filter((a) => a.balance.gt(0)));
  const now = today();
  const month = now.toLocaleString("en-US", { month: "long", timeZone: "UTC" });

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={formatDate(now)}
        actions={
          <>
            <ButtonLink href="/shipments/new" variant="secondary">New shipment</ButtonLink>
            <ButtonLink href="/invoices/new">New invoice</ButtonLink>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={`Sales in ${month}`} value={`EGP ${money(s.salesThisMonth, 0)}`} hint="Before VAT" />
        <Stat label={`Gross margin in ${month}`} value={`EGP ${money(s.marginThisMonth, 0)}`} hint={s.salesThisMonth.isZero() ? "No sales yet" : `${pct(s.marginPctThisMonth)} of sales`} tone="good" />
        <Stat label="Stock value" value={`EGP ${money(s.stockValue, 0)}`} hint="At landed cost" />
        <Stat label="Lots expiring in 90 days" value={s.expiring.length} tone={s.expiring.length ? "warn" : "default"} hint={<RowLink href="/reports/expiry">See them</RowLink>} />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Customers owe you" value={`EGP ${money(owedToUs, 0)}`} hint={<RowLink href="/receivables">By customer</RowLink>} />
        <Stat label="Overdue from customers" value={`EGP ${money(overdueToUs, 0)}`} tone={overdueToUs.gt(0) ? "warn" : "default"} hint={`${customers.filter((a) => a.overdue.gt(0)).length} customers late`} />
        <Stat label="You owe suppliers" value={weOwe.length ? weOwe.map((t) => <div key={t.currency}>{t.currency} {money(t.balance, 0)}</div>) : "Nothing"} hint={<RowLink href="/payables">By supplier</RowLink>} />
        <Stat
          label="Overdue to suppliers"
          value={weOwe.some((t) => t.overdue.gt(0)) ? weOwe.filter((t) => t.overdue.gt(0)).map((t) => <div key={t.currency}>{t.currency} {money(t.overdue, 0)}</div>) : "None"}
          tone={weOwe.some((t) => t.overdue.gt(0)) ? "warn" : "default"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Shipments on the way" actions={<RowLink href="/shipments">All</RowLink>} padded={false}>
          <Table head={<tr><th>Shipment</th><th>Supplier</th><th>ETA</th><th>Status</th></tr>} empty="Nothing on the way.">
            {s.openShipments.map((sh) => {
              const late = sh.eta && sh.eta < now;
              return (
                <tr key={sh.id}>
                  <td><RowLink href={`/shipments/${sh.id}`}>{sh.ref}</RowLink></td>
                  <td>{sh.supplier.name}</td>
                  <td className={late ? "font-medium text-amber-700" : ""}>{formatDate(sh.eta)}{late && " · late"}</td>
                  <td><StatusBadge status={sh.status} /></td>
                </tr>
              );
            })}
          </Table>
        </Card>

        <Card title={`Best sellers in ${month}`} actions={<RowLink href="/reports/margin">Margins</RowLink>} padded={false}>
          <Table head={<tr><th>Product</th><th className="num">Sales</th><th className="num">Margin</th></tr>} empty="No sales this month yet.">
            {s.topItems.map((r) => (
              <tr key={r.key}>
                <td>{r.label}</td>
                <td className="num">{money(r.revenue, 0)}</td>
                <td className="num">{pct(r.marginPct)}</td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title="Latest invoices" actions={<RowLink href="/invoices">All</RowLink>} padded={false}>
          <Table head={<tr><th>Invoice</th><th>Customer</th><th>Date</th><th className="num">Total</th></tr>} empty="No invoices yet.">
            {s.recentInvoices.map((i) => (
              <tr key={i.id}>
                <td><RowLink href={`/invoices/${i.id}`}>{i.number}</RowLink></td>
                <td>{i.customer.name}</td>
                <td>{formatDate(i.date)}</td>
                <td className="num">{money(invoiceTotals(i.lines, i.vatRate.toString()).total, 0)}</td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title="Expiring soon" actions={<RowLink href="/reports/expiry">All</RowLink>} padded={false}>
          <Table head={<tr><th>Lot</th><th>Product</th><th>Expiry</th><th className="num">On hand</th></tr>} empty="No lots expire in the next 90 days.">
            {s.expiring.slice(0, 6).map((l) => (
              <tr key={l.id}>
                <td><RowLink href={`/stock/lots/${l.id}`}>{l.lotNo}</RowLink></td>
                <td>{l.item.name}</td>
                <td>{l.expiryDate! < now ? <Badge color="red">Expired</Badge> : formatDate(l.expiryDate)}</td>
                <td className="num">{qty(l.qtyOnHand)} {l.item.unit}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
