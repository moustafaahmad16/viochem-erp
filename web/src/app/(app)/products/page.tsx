import { Badge, ButtonLink, Card, PageHeader, RowLink, Table } from "@/components/ui";
import { db } from "@/lib/db";
import { qty } from "@/lib/format";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("Products") };
}

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const t = await getT();
  const q = String((await searchParams).q ?? "").trim();
  const items = await db.item.findMany({
    where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }, { casNumber: { contains: q } }] } : {},
    orderBy: { name: "asc" },
    include: { lots: { where: { qtyOnHand: { gt: 0 } }, select: { qtyOnHand: true } } },
  });
  return (
    <>
      <PageHeader title={t("Products")} subtitle={t("{n} products", { n: items.length })} actions={<ButtonLink href="/products/new">{t("Add product")}</ButtonLink>} />
      <Card padded={false}>
        <form className="border-b border-slate-100 p-3">
          <input name="q" defaultValue={q} placeholder={t("Search by name, code or CAS number")} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:w-80" />
        </form>
        <Table
          head={<tr><th>{t("Product")}</th><th>{t("Code")}</th><th>CAS</th><th className="num">{t("In stock")}</th><th /></tr>}
          empty={t("No products yet. Add your first product to get started.")}
        >
          {items.map((i) => (
            <tr key={i.id} className="hover:bg-slate-50">
              <td><RowLink href={`/products/${i.id}`}>{i.name}</RowLink></td>
              <td className="text-slate-600">{i.code}</td>
              <td className="text-slate-600">{i.casNumber}</td>
              <td className="num">{qty(i.lots.reduce((s, l) => s + Number(l.qtyOnHand), 0))} {t(i.unit)}</td>
              <td>{!i.active && <Badge>{t("Inactive")}</Badge>}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
