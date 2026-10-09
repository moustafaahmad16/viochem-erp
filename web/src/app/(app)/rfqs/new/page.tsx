import { ActionForm, Field, Submit, TextArea } from "@/components/forms";
import { Card, PageHeader, Table } from "@/components/ui";
import { addDays, toInputDate, today } from "@/lib/dates";
import { qty } from "@/lib/format";
import { lowStock } from "@/lib/services/alerts";
import { getT } from "@/i18n/server";
import { createRfq } from "../actions";

export async function generateMetadata() {
  return { title: (await getT())("New request for quotation") };
}

export default async function NewRfqPage({ searchParams }: PageProps<"/rfqs/new">) {
  const t = await getT();
  const fromLow = (await searchParams).from === "low-stock";
  // What is short, after what is already ordered or on the way, with enough to get back to the alert level.
  const low = fromLow ? (await lowStock()).filter((r) => r.short.gt(0)) : [];
  const now = today();

  return (
    <>
      <PageHeader
        title={t("New request for quotation")}
        subtitle={fromLow ? t("These products are below their alert level. Change the quantities, or clear any you don't want to ask about.") : t("You'll add the products and suppliers on the next screen.")}
        back={{ href: "/rfqs", label: t("Requests for quotation") }}
      />
      <ActionForm action={createRfq} className="grid gap-6 lg:grid-cols-3">
        {fromLow && (
          <Card title={t("Products to ask about")} padded={false} className="lg:col-span-2">
            <Table head={<tr><th>{t("Product")}</th><th className="num">{t("On hand")}</th><th className="num">{t("Alert level")}</th><th className="num">{t("Ask for")}</th></tr>} empty={t("Nothing is running low.")}>
              {low.map((r) => (
                <tr key={r.itemId}>
                  <td><span className="me-2 inline-block font-mono text-xs text-slate-400">{r.code}</span>{r.name}</td>
                  <td className="num">{qty(r.onHand)} {t(r.unit)}</td>
                  <td className="num">{qty(r.minQty)}</td>
                  <td className="num"><input name={`qty_${r.itemId}`} defaultValue={r.short.toString()} inputMode="decimal" aria-label={r.name} className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-end text-sm" /></td>
                </tr>
              ))}
            </Table>
          </Card>
        )}
        <Card className={fromLow ? "" : "max-w-xl lg:col-span-2"}>
          <div className="space-y-4">
            <Field label={t("Date")} name="date" type="date" defaultValue={toInputDate(now)} required />
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("Suppliers reply by")} name="replyBy" type="date" defaultValue={toInputDate(addDays(now, 7))} />
              <Field label={t("Needed in Egypt by")} name="neededBy" type="date" hint={t("Offers that would arrive later count as more expensive.")} />
            </div>
            <TextArea label={t("Notes for suppliers")} name="notes" placeholder={t("e.g. CIF Alexandria, COA and MSDS with the offer")} />
            <Submit>{t("Continue")}</Submit>
          </div>
        </Card>
      </ActionForm>
    </>
  );
}
