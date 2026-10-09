import Decimal from "decimal.js";
import { ExportButtons } from "@/components/export-buttons";
import { ActionForm } from "@/components/forms";
import { Badge, Card, PageHeader, RowLink, Table } from "@/components/ui";
import { money, pct } from "@/lib/format";
import { supplierSort } from "@/lib/reports/definitions";
import { supplierRanking } from "@/lib/services/rankings";
import { Share } from "@/components/share";
import { getT } from "@/i18n/server";
import { createSupplier } from "./actions";
import { SupplierFields } from "./fields";

export async function generateMetadata() {
  return { title: (await getT())("Suppliers") };
}

const SORTS = [
  { key: "purchases", label: "Most bought" },
  { key: "balance", label: "Owed most" },
  { key: "overdue", label: "Most overdue" },
  { key: "name", label: "A to Z" },
] as const;

export default async function SuppliersPage({ searchParams }: PageProps<"/suppliers">) {
  const t = await getT();
  const sort = supplierSort((await searchParams).sort);
  const rows = await supplierRanking(sort);
  const total = (k: "purchases" | "balance" | "overdue") => rows.reduce((s, r) => s.plus(r[k]), new Decimal(0));
  const pill = (on: boolean) => `rounded-full px-3 py-1 text-sm ${on ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-200"}`;
  const ranked = sort !== "name";

  return (
    <>
      <PageHeader
        title={t("Suppliers")}
        subtitle={t("{n} suppliers", { n: rows.length })}
        actions={
          <>
            <ExportButtons report="suppliers" query={{ sort }} />
            <a href="#add" className="inline-flex items-center rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700">{t("Add a supplier")}</a>
          </>
        }
      />
      <Card padded={false} className="mb-6">
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 p-3">
          {SORTS.map((s) => (
            <a key={s.key} href={s.key === "purchases" ? "/suppliers" : `/suppliers?sort=${s.key}`} className={pill(sort === s.key)}>{t(s.label)}</a>
          ))}
          <span className="ms-auto text-xs text-slate-500">{t("Purchases over the last 12 months, balances today")}</span>
        </div>
        <Table
          head={
            <tr>
              {ranked && <th className="num">#</th>}
              <th>{t("Supplier")}</th>
              <th className="num">{t("Purchases (EGP)")}</th>
              <th className="num">{t("Shipments")}</th>
              <th>{t("Last shipment")}</th>
              <th className="num">{t("On time")}</th>
              <th className="num">{t("You owe")}</th>
              <th className="num">{t("Overdue (EGP)")}</th>
            </tr>
          }
          empty={t("No suppliers yet.")}
          footer={rows.length > 0 && (
            <tr>
              {ranked && <td />}
              <td>{t("Total")}</td>
              <td className="num">{money(total("purchases"), 0)}</td>
              <td className="num">{rows.reduce((s, r) => s + r.shipments, 0)}</td>
              <td />
              <td />
              <td className="num">EGP {money(total("balance"), 0)}</td>
              <td className="num">{money(total("overdue"), 0)}</td>
            </tr>
          )}
        >
          {rows.map((r, i) => (
            <tr key={r.id}>
              {ranked && <td className="num text-slate-500">{i + 1}</td>}
              <td>
                <RowLink href={`/suppliers/${r.id}`}>{r.name}</RowLink>
                {r.country && <div className="text-xs text-slate-500">{r.country}</div>}
              </td>
              <td className="num">
                {!r.purchases.isZero() && money(r.purchases, 0)}
                {!r.share.isZero() && <Share value={r.share} />}
              </td>
              <td className="num">{r.shipments || ""}</td>
              <td className="whitespace-nowrap">{t.date(r.lastShipment)}</td>
              <td className="num">
                {r.onTimePct == null ? "" : (
                  <span title={r.avgDaysLate ? t("{n} days late on average", { n: r.avgDaysLate.toFixed(0) }) : undefined}>
                    <Badge color={r.onTimePct >= 80 ? "green" : r.onTimePct >= 50 ? "amber" : "red"}>{pct(r.onTimePct)}</Badge>
                  </span>
                )}
              </td>
              <td className="num whitespace-nowrap font-medium">
                {r.balances.map((b) => (
                  <div key={b.currency} className={b.balance.lt(0) ? "text-brand-700" : ""}>{b.currency} {money(b.balance, 0)}</div>
                ))}
              </td>
              <td className={`num ${r.overdue.gt(0) ? "font-medium text-red-700" : ""}`}>{r.overdue.isZero() ? "" : money(r.overdue, 0)}</td>
            </tr>
          ))}
        </Table>
        <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
          {t("Purchases are in EGP at each shipment's rate. Owed and overdue totals use the latest shipment rate. On time counts shipments that arrived by their ETA.")}
        </p>
      </Card>
      <div id="add" className="max-w-xl scroll-mt-6">
        <Card title={t("Add a supplier")}>
          <ActionForm action={createSupplier} resetOnSuccess>
            <SupplierFields t={t} />
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
