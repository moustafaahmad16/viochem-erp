import { notFound } from "next/navigation";
import { ActionForm } from "@/components/forms";
import { Card, PageHeader, RowLink, Stat, Table } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { money } from "@/lib/format";
import { supplierAccounts } from "@/lib/services/accounts";
import { updateSupplier } from "../actions";
import { CURRENCIES, SupplierFields } from "../fields";
import { StatusBadge } from "../../shipments/status";
import { deleteSupplierPayment, paySupplier } from "../../payments/actions";
import { Balance, OpenBills, PaySupplierForm, Statement } from "../../payments/parts";

export default async function SupplierPage({ params }: PageProps<"/suppliers/[id]">) {
  const id = Number((await params).id);
  const [[acc], user] = await Promise.all([supplierAccounts({ id }), currentUser()]);
  if (!acc) notFound();
  const s = acc.supplier;
  const deletes = user?.role === "ADMIN" ? new Map(acc.payments.map((p) => [p.number, deleteSupplierPayment.bind(null, p.id)])) : undefined;
  const shipments = [...s.shipments].sort((a, b) => b.orderDate.getTime() - a.orderDate.getTime());
  const unpaid = acc.accounts.flatMap((a) => a.bills.filter((b) => b.outstanding.gt(0) && b.key !== "opening").map((b) => ({ ...b, currency: a.currency })));

  return (
    <>
      <PageHeader
        title={s.name}
        subtitle={[s.country, s.currency, s.paymentTermsDays ? `Paid ${s.paymentTermsDays} days after order` : "Paid when ordered"].filter(Boolean).join(" · ")}
        back={{ href: "/suppliers", label: "Suppliers" }}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat
          label="You owe"
          value={acc.accounts.length ? acc.accounts.map((a) => <div key={a.currency}><Balance value={a.balance} currency={a.currency} /></div>) : <span className="text-slate-500">Nothing</span>}
        />
        <Stat
          label="Overdue"
          value={acc.accounts.some((a) => a.overdue.gt(0)) ? acc.accounts.filter((a) => a.overdue.gt(0)).map((a) => <div key={a.currency}>{a.currency} {money(a.overdue)}</div>) : "None"}
          tone={acc.accounts.some((a) => a.overdue.gt(0)) ? "warn" : "default"}
        />
        <Stat label="Payment terms" value={`${s.paymentTermsDays} days`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {acc.accounts.map((a) => (
            <Card key={a.currency} title={acc.accounts.length > 1 ? `Unpaid in ${a.currency}` : `Unpaid (${a.currency})`} padded={false}>
              <OpenBills account={a} />
            </Card>
          ))}
          {acc.accounts.map((a) => (
            <Card key={a.currency} title={`Statement (${a.currency})`} padded={false}>
              <Statement account={a} onDelete={deletes} />
            </Card>
          ))}
          <Card title="Shipments" padded={false}>
            <Table head={<tr><th>Shipment</th><th>Ordered</th><th>Status</th></tr>} empty="No shipments from this supplier yet.">
              {shipments.map((sh) => (
                <tr key={sh.id}>
                  <td><RowLink href={`/shipments/${sh.id}`}>{sh.ref}</RowLink></td>
                  <td>{formatDate(sh.orderDate)}</td>
                  <td><StatusBadge status={sh.status} /></td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Pay this supplier">
            <PaySupplierForm
              action={paySupplier.bind(null, s.id)}
              currency={s.currency}
              currencies={CURRENCIES}
              shipments={unpaid.map((b) => ({ id: Number(String(b.key).replace("shp:", "")), label: `${b.label} · ${b.currency} ${money(b.outstanding)} owed` }))}
            />
          </Card>
          <Card title="Details">
            <ActionForm action={updateSupplier.bind(null, s.id)}>
              <SupplierFields s={s} />
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
