import Decimal from "decimal.js";
import { ExportButtons } from "@/components/export-buttons";
import { ActionForm } from "@/components/forms";
import { Share } from "@/components/share";
import { Card, PageHeader, RowLink, Table } from "@/components/ui";
import { money, pct } from "@/lib/format";
import { customerSort } from "@/lib/reports/definitions";
import { customerRanking } from "@/lib/services/rankings";
import { getT } from "@/i18n/server";
import { createCustomer } from "./actions";
import { CustomerFields } from "./fields";

export async function generateMetadata() {
  return { title: (await getT())("Customers") };
}

const SORTS = [
  { key: "sales", label: "Most sales" },
  { key: "margin", label: "Most margin" },
  { key: "balance", label: "Owe most" },
  { key: "overdue", label: "Most overdue" },
  { key: "name", label: "A to Z" },
] as const;

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  const t = await getT();
  const sort = customerSort((await searchParams).sort);
  const rows = await customerRanking(sort);
  const total = (k: "sales" | "margin" | "balance" | "overdue") => rows.reduce((s, r) => s.plus(r[k]), new Decimal(0));
  const pill = (on: boolean) => `rounded-full px-3 py-1 text-sm ${on ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-200"}`;
  const ranked = sort !== "name";

  return (
    <>
      <PageHeader
        title={t("Customers")}
        subtitle={t("{n} customers", { n: rows.length })}
        actions={
          <>
            <ExportButtons report="customers" query={{ sort }} />
            <a href="#add" className="inline-flex items-center rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700">{t("Add a customer")}</a>
          </>
        }
      />
      <Card padded={false} className="mb-6">
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 p-3">
          {SORTS.map((s) => (
            <a key={s.key} href={s.key === "sales" ? "/customers" : `/customers?sort=${s.key}`} className={pill(sort === s.key)}>{t(s.label)}</a>
          ))}
          <span className="ms-auto text-xs text-slate-500">{t("Sales over the last 12 months, balances today")}</span>
        </div>
        <Table
          head={
            <tr>
              {ranked && <th className="num">#</th>}
              <th>{t("Customer")}</th>
              <th className="num">{t("Sales (EGP)")}</th>
              <th className="num">{t("Margin (EGP)")}</th>
              <th className="num">{t("Invoices")}</th>
              <th>{t("Last invoice")}</th>
              <th className="num">{t("Balance (EGP)")}</th>
              <th className="num">{t("Overdue (EGP)")}</th>
            </tr>
          }
          empty={t("No customers yet.")}
          footer={rows.length > 0 && (
            <tr>
              {ranked && <td />}
              <td>{t("Total")}</td>
              <td className="num">{money(total("sales"), 0)}</td>
              <td className="num">
                {money(total("margin"), 0)}
                {!total("sales").isZero() && <div className="text-xs font-normal text-slate-500" dir="ltr">{pct(total("margin").div(total("sales")).times(100))}</div>}
              </td>
              <td className="num">{rows.reduce((s, r) => s + r.invoices, 0)}</td>
              <td />
              <td className="num">{money(total("balance"), 0)}</td>
              <td className="num">{money(total("overdue"), 0)}</td>
            </tr>
          )}
        >
          {rows.map((r, i) => (
            <tr key={r.id}>
              {ranked && <td className="num text-slate-500">{i + 1}</td>}
              <td><RowLink href={`/customers/${r.id}`}>{r.name}</RowLink></td>
              <td className="num">
                {!r.sales.isZero() && money(r.sales, 0)}
                {!r.share.isZero() && <Share value={r.share} />}
              </td>
              <td className={`num ${r.margin.lt(0) ? "text-red-700" : ""}`}>
                {!r.sales.isZero() && (
                  <>
                    {money(r.margin, 0)}
                    <div className="text-xs text-slate-500" dir="ltr">{pct(r.marginPct)}</div>
                  </>
                )}
              </td>
              <td className="num">{r.invoices || ""}</td>
              <td className="whitespace-nowrap">{t.date(r.lastInvoice)}</td>
              <td className={`num font-medium ${r.balance.lt(0) ? "text-brand-700" : ""}`}>{r.balance.isZero() ? "" : money(r.balance, 0)}</td>
              <td className={`num ${r.overdue.gt(0) ? "font-medium text-red-700" : ""}`}>{r.overdue.isZero() ? "" : money(r.overdue, 0)}</td>
            </tr>
          ))}
        </Table>
      </Card>
      <div id="add" className="max-w-xl scroll-mt-6">
        <Card title={t("Add a customer")}>
          <ActionForm action={createCustomer} resetOnSuccess>
            <CustomerFields />
          </ActionForm>
        </Card>
      </div>
    </>
  );
}

