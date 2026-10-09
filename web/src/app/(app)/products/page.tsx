import { ExportButtons } from "@/components/export-buttons";
import { Badge, ButtonLink, Card, PageHeader, RowLink, Table } from "@/components/ui";
import { money, qty } from "@/lib/format";
import { MOVEMENT_LABEL, productSort } from "@/lib/reports/definitions";
import { productMovement, type Movement } from "@/lib/services/rankings";
import { Share } from "@/components/share";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("Products") };
}

const MOVEMENT_COLOR: Record<Movement, "green" | "blue" | "amber" | "gray"> = { fast: "green", medium: "blue", slow: "amber", none: "gray" };

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const t = await getT();
  const sp = await searchParams;
  const q = String(sp.q ?? "").trim();
  const sort = productSort(sp.sort);
  let items = await productMovement();
  if (q) items = items.filter((r) => [r.name, r.code, r.cas ?? ""].some((s) => s.toLowerCase().includes(q.toLowerCase())));
  if (sort === "movement") items.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.name.localeCompare(b.name));
  const counts = items.reduce((c, r) => ({ ...c, [r.movement]: (c[r.movement] ?? 0) + 1 }), {} as Partial<Record<Movement, number>>);
  const link = (s: string) => `/products?${new URLSearchParams({ ...(q ? { q } : {}), ...(s === "name" ? {} : { sort: s }) })}`;
  const pill = (on: boolean) => `rounded-full px-3 py-1 text-sm ${on ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-200"}`;

  return (
    <>
      <PageHeader
        title={t("Products")}
        subtitle={t("{n} products", { n: items.length })}
        actions={
          <>
            <ExportButtons report="products" query={{ q, sort: sort === "name" ? undefined : sort }} />
            <ButtonLink href="/products/new">{t("Add product")}</ButtonLink>
          </>
        }
      />
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-3">
          <form>
            {sort !== "name" && <input type="hidden" name="sort" value={sort} />}
            <input name="q" defaultValue={q} placeholder={t("Search by name, code or CAS number")} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:w-80" />
          </form>
          <div className="flex gap-1">
            <a href={link("name")} className={pill(sort === "name")}>{t("A to Z")}</a>
            <a href={link("movement")} className={pill(sort === "movement")}>{t("By movement")}</a>
          </div>
          <div className="ms-auto flex flex-wrap gap-1.5 text-xs">
            {(["fast", "medium", "slow", "none"] as const).map((m) => counts[m] ? <Badge key={m} color={MOVEMENT_COLOR[m]}>{t(MOVEMENT_LABEL[m])} · {counts[m]}</Badge> : null)}
          </div>
        </div>
        <Table
          head={
            <tr>
              {sort === "movement" && <th className="num">#</th>}
              <th>{t("Product")}</th>
              <th>CAS</th>
              <th>{t("Movement")}</th>
              <th className="num">{t("Sold in 12 months")}</th>
              <th className="num">{t("Sales (EGP)")}</th>
              <th className="num">{t("Sold per month")}</th>
              <th>{t("Last sale")}</th>
              <th className="num">{t("In stock")}</th>
            </tr>
          }
          empty={q ? t("No products match.") : t("No products yet. Add your first product to get started.")}
        >
          {items.map((i) => (
            <tr key={i.itemId} className="hover:bg-slate-50">
              {sort === "movement" && <td className="num text-slate-500">{i.rank ?? ""}</td>}
              <td>
                <RowLink href={`/products/${i.itemId}`}>{i.name}</RowLink>
                <span className="ms-2 inline-block text-xs text-slate-500">{i.code}</span>
                {!i.active && <span className="ms-2"><Badge>{t("Inactive")}</Badge></span>}
              </td>
              <td className="whitespace-nowrap text-slate-600">{i.cas}</td>
              <td><Badge color={MOVEMENT_COLOR[i.movement]}>{t(MOVEMENT_LABEL[i.movement])}</Badge></td>
              <td className="num whitespace-nowrap">{i.qty.isZero() ? "" : `${qty(i.qty)} ${t(i.unit)}`}</td>
              <td className="num">
                {!i.revenue.isZero() && money(i.revenue, 0)}
                {!i.share.isZero() && <Share value={i.share} />}
              </td>
              <td className="num">{i.monthlyRate.isZero() ? "" : qty(i.monthlyRate.toDecimalPlaces(1))}</td>
              <td className="whitespace-nowrap">{t.date(i.lastSale)}</td>
              <td className="num whitespace-nowrap">
                {qty(i.onHand)} {t(i.unit)}
                {i.coverMonths && <div className={`text-xs ${i.coverMonths.lt(1) ? "font-medium text-amber-700" : "text-slate-500"}`}>{i.coverMonths.toDecimalPlaces(1).eq(1) ? t("1 month") : t("{n} months", { n: qty(i.coverMonths.toDecimalPlaces(1)) })}</div>}
              </td>
            </tr>
          ))}
        </Table>
        <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
          {t("Fast moving products make the first 80% of sales over the last 12 months, medium the next 15%, slow the rest. Not moving: nothing sold in the last six months.")}
        </p>
      </Card>
    </>
  );
}
