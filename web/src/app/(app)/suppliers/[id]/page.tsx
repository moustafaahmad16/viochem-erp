import { notFound } from "next/navigation";
import { ActionForm } from "@/components/forms";
import { ButtonLink, Card, PageHeader, RowLink, Stat, Table } from "@/components/ui";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { money } from "@/lib/format";
import { getT } from "@/i18n/server";
import { supplierAccounts } from "@/lib/services/accounts";
import { updateSupplier } from "../actions";
import { PendingCheques } from "../../cheques/pending";
import { CURRENCIES, SupplierFields } from "../fields";
import { StatusBadge } from "../../shipments/status";
import { deleteSupplierPayment, paySupplier } from "../../payments/actions";
import { accountOptions, Balance, OpenBills, PaySupplierForm, Statement } from "../../payments/parts";

export default async function SupplierPage({ params }: PageProps<"/suppliers/[id]">) {
  const t = await getT();
  const id = Number((await params).id);
  const [[acc], user, accounts, openOrders] = await Promise.all([
    supplierAccounts({ id }),
    currentUser(),
    accountOptions(),
    db.purchaseOrder.findMany({ where: { supplierId: id, status: "OPEN" }, orderBy: [{ date: "desc" }, { id: "desc" }], take: 10 }),
  ]);
  if (!acc) notFound();
  const s = acc.supplier;
  const deletes = user?.role === "ADMIN" ? new Map(acc.payments.map((p) => [p.number, deleteSupplierPayment.bind(null, p.id)])) : undefined;
  const shipments = [...s.shipments].sort((a, b) => b.orderDate.getTime() - a.orderDate.getTime());
  const unpaid = acc.accounts.flatMap((a) => a.bills.filter((b) => b.outstanding.gt(0) && b.key !== "opening").map((b) => ({ ...b, currency: a.currency })));

  return (
    <>
      <PageHeader
        title={s.name}
        subtitle={[s.country, s.currency, s.paymentTermsDays ? t("Paid {n} days after order", { n: s.paymentTermsDays }) : t("Paid when ordered")].filter(Boolean).join(" · ")}
        back={{ href: "/suppliers", label: t("Suppliers") }}
        actions={<ButtonLink href={`/purchase-orders/new?supplier=${s.id}`} variant="secondary">{t("New purchase order")}</ButtonLink>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat
          label={t("You owe")}
          value={acc.accounts.length ? acc.accounts.map((a) => <div key={a.currency}><Balance value={a.balance} currency={a.currency} /></div>) : <span className="text-slate-500">{t("Nothing")}</span>}
        />
        <Stat
          label={t("Overdue")}
          value={acc.accounts.some((a) => a.overdue.gt(0)) ? acc.accounts.filter((a) => a.overdue.gt(0)).map((a) => <div key={a.currency}>{a.currency} {money(a.overdue)}</div>) : t("None")}
          tone={acc.accounts.some((a) => a.overdue.gt(0)) ? "warn" : "default"}
        />
        <Stat label={t("Payment terms")} value={t("{n} days", { n: s.paymentTermsDays })} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {acc.accounts.map((a) => (
            <Card key={a.currency} title={acc.accounts.length > 1 ? t("Unpaid in {currency}", { currency: a.currency }) : t("Unpaid ({currency})", { currency: a.currency })} padded={false}>
              <OpenBills account={a} />
            </Card>
          ))}
          {acc.accounts.map((a) => (
            <Card key={a.currency} title={t("Statement ({currency})", { currency: a.currency })} padded={false}>
              <Statement account={a} onDelete={deletes} />
            </Card>
          ))}
          <Card title={t("Shipments")} padded={false}>
            <Table head={<tr><th>{t("Shipment")}</th><th>{t("Ordered")}</th><th>{t("Status")}</th></tr>} empty={t("No shipments from this supplier yet.")}>
              {shipments.map((sh) => (
                <tr key={sh.id}>
                  <td><RowLink href={`/shipments/${sh.id}`}>{sh.ref}</RowLink></td>
                  <td>{t.date(sh.orderDate)}</td>
                  <td><StatusBadge status={sh.status} /></td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
        <div className="space-y-6">
          {openOrders.length > 0 && (
            <Card title={t("Open purchase orders")} padded={false}>
              <Table head={<tr><th>{t("Order")}</th><th>{t("Expected")}</th></tr>}>
                {openOrders.map((o) => (
                  <tr key={o.id}>
                    <td><RowLink href={`/purchase-orders/${o.id}`}>{o.number}</RowLink></td>
                    <td>{t.date(o.expectedDate)}</td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}
          <PendingCheques supplierId={s.id} />
          <Card title={t("Pay this supplier")}>
            <PaySupplierForm
              action={paySupplier.bind(null, s.id)}
              currency={s.currency}
              currencies={CURRENCIES}
              accounts={accounts}
              shipments={unpaid.map((b) => ({ id: Number(String(b.key).replace("shp:", "")), label: `${b.label} · ${t("{amount} owed", { amount: `${b.currency} ${money(b.outstanding)}` })}` }))}
            />
          </Card>
          <Card title={t("Details")}>
            <ActionForm action={updateSupplier.bind(null, s.id)}>
              <SupplierFields s={s} t={t} />
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
