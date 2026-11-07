import { Badge, RowLink, Table } from "@/components/ui";
import { money, qty } from "@/lib/format";
import type { T } from "@/i18n/core";
import type { HistoryRow, MoveType } from "@/lib/services/product";

const TYPE: Record<MoveType, { label: string; color: "gray" | "green" | "blue" | "amber" | "red" }> = {
  OPENING: { label: "Opening stock", color: "gray" },
  RECEIPT: { label: "Purchase", color: "green" },
  SALE: { label: "Sale", color: "blue" },
  RETURN: { label: "Return", color: "amber" },
  ADJUSTMENT: { label: "Stock count", color: "gray" },
};

/** A movement row with plain numbers, so it can be sent to the browser (to the quotation's pop-up). */
export type MoveRow = Omit<HistoryRow, "qtyIn" | "qtyOut" | "price" | "balance" | "avgCost" | "value"> & {
  qtyIn: string;
  qtyOut: string;
  price: string;
  balance: string;
  avgCost: string;
  value: string;
};

export function toMoveRows(rows: HistoryRow[]): MoveRow[] {
  return rows.map((r) => ({
    ...r,
    qtyIn: r.qtyIn.toString(),
    qtyOut: r.qtyOut.toString(),
    price: r.price.toString(),
    balance: r.balance.toString(),
    avgCost: r.avgCost.toString(),
    value: r.value.toString(),
  }));
}

/** Every movement of a product with the running balance and average cost: on the product page and in the quotation's pop-up. */
export function MovementsTable({ rows, unit, t, newTab = false }: { rows: MoveRow[]; unit: string; t: T; newTab?: boolean }) {
  const last = rows.at(-1);
  // In a pop-up, links open in a new tab so the page underneath (a quotation being written) stays as it is.
  const link = (href: string, label: string) =>
    newTab ? <a href={href} target="_blank" rel="noreferrer" className="whitespace-nowrap font-medium text-brand-700 hover:underline">{label}</a> : <RowLink href={href}>{label}</RowLink>;
  return (
    <Table
      head={
        <tr>
          <th>{t("Date")}</th>
          <th>{t("Type")}</th>
          <th>{t("Document")}</th>
          <th className="num">{t("In")}</th>
          <th className="num">{t("Out")}</th>
          <th className="num">{t("Price (EGP)")}</th>
          <th className="num">{t("Balance ({unit})", { unit })}</th>
          <th className="num">{t("Average cost")}</th>
          <th className="num">{t("Stock value")}</th>
        </tr>
      }
      empty={t("No stock received yet.")}
      footer={last && (
        <tr>
          <td colSpan={6}>{t("Now")}</td>
          <td className="num">{qty(last.balance)}</td>
          <td className="num">{money(last.avgCost)}</td>
          <td className="num">{money(last.value)}</td>
        </tr>
      )}
    >
      {rows.map((r, i) => {
        const changed = i === 0 || r.avgCost !== rows[i - 1].avgCost;
        return (
          <tr key={r.key}>
            <td className="whitespace-nowrap">{t.date(new Date(r.date))}</td>
            <td><Badge color={TYPE[r.type].color}>{t(TYPE[r.type].label)}</Badge></td>
            <td>
              {r.doc && link(r.doc.href, r.doc.label)}
              {r.party && <div><a href={r.party.href} target={newTab ? "_blank" : undefined} rel={newTab ? "noreferrer" : undefined} className="text-xs text-slate-500 hover:underline">{r.party.name}</a></div>}
              {r.note && <div className="text-xs text-slate-500">{r.note}</div>}
            </td>
            <td className="num text-emerald-700">{Number(r.qtyIn) === 0 ? "" : qty(r.qtyIn)}</td>
            <td className="num text-red-700">{Number(r.qtyOut) === 0 ? "" : qty(r.qtyOut)}</td>
            <td className="num">{money(r.price)}</td>
            <td className="num font-medium">{qty(r.balance)}</td>
            <td className={`num ${changed ? "font-semibold text-slate-900" : "text-slate-500"}`}>{money(r.avgCost)}</td>
            <td className="num">{money(r.value)}</td>
          </tr>
        );
      })}
    </Table>
  );
}
