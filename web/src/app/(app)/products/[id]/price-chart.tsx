import Decimal from "decimal.js";
import { Card } from "@/components/ui";
import { money } from "@/lib/format";
import { priceSeries } from "@/lib/services/price-history";
import type { T } from "@/i18n/core";

const W = 760;
const H = 260;
const L = 64;
const R = 16;
const TOP = 16;
const B = 32;

/** Selling prices and landed cost over the last 12 months, so a price that drifts below cost shows at a glance. */
export async function PriceChart({ itemId, unit, t }: { itemId: number; unit: string; t: T }) {
  const s = await priceSeries(itemId);
  if (s.sales.length === 0 && s.costs.length === 0) return null;
  const t0 = s.from.getTime();
  const t1 = s.to.getTime();
  const x = (d: Date) => L + ((Math.max(d.getTime(), t0) - t0) / (t1 - t0)) * (W - L - R);
  const all = [...s.sales, ...s.costs.filter((c) => c.date.getTime() >= t0)].map((p) => p.price.toNumber());
  const before = [...s.costs].reverse().find((c) => c.date.getTime() < t0);
  if (before) all.push(before.price.toNumber());
  const max = Math.max(...all) * 1.08;
  const min = Math.max(0, Math.min(...all) * 0.85);
  const y = (v: number) => TOP + (1 - (v - min) / (max - min)) * (H - TOP - B);

  // Landed cost as a step line: each batch's cost holds until the next one arrives.
  const steps = [...(before ? [{ date: s.from, price: before.price }] : []), ...s.costs.filter((c) => c.date.getTime() >= t0)];
  let costPath = "";
  steps.forEach((c, i) => {
    const cx = x(c.date);
    const cy = y(c.price.toNumber());
    costPath += i === 0 ? `M${cx},${cy}` : `H${cx}V${cy}`;
  });
  if (steps.length) costPath += `H${W - R}`;

  // Monthly average selling price.
  const months: { date: Date; avg: number }[] = [];
  for (let i = 0; i <= 12; i++) {
    const m0 = new Date(Date.UTC(s.from.getUTCFullYear(), s.from.getUTCMonth() + i, 1));
    const m1 = new Date(Date.UTC(m0.getUTCFullYear(), m0.getUTCMonth() + 1, 1));
    const ps = s.sales.filter((p) => p.date >= m0 && p.date < m1);
    if (ps.length) months.push({ date: new Date(Math.min(m0.getTime() + 14 * 864e5, t1)), avg: ps.reduce((a, p) => a.plus(p.price), new Decimal(0)).div(ps.length).toNumber() });
  }
  const avgPath = months.map((m, i) => `${i ? "L" : "M"}${x(m.date)},${y(m.avg)}`).join("");

  const ticks = Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4);
  const monthTicks = Array.from({ length: 13 }, (_, i) => new Date(Date.UTC(s.from.getUTCFullYear(), s.from.getUTCMonth() + i, 1))).filter((d) => d.getTime() >= t0 && d.getTime() <= t1);
  const lastCost = steps.at(-1)?.price;
  const lastAvg = months.at(-1)?.avg;

  return (
    <Card
      title={t("Price history")}
      actions={
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
          <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-brand-500/40" />{t("Each sale")}</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 bg-brand-500" />{t("Average selling price")}</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 bg-red-600" />{t("Landed cost")}</span>
        </div>
      }
    >
      <div dir="ltr">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={t("Price history")}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="stroke-slate-200" />
              <text x={L - 8} y={y(v) + 4} textAnchor="end" className="fill-slate-500 text-[11px]">{money(v, 0)}</text>
            </g>
          ))}
          {monthTicks.map((d, i) => (
            <text key={d.toISOString()} x={x(d)} y={H - 10} textAnchor="middle" className={`fill-slate-500 text-[11px] ${i % 2 ? "max-sm:hidden" : ""}`}>{t.date(d).slice(3, 6)}</text>
          ))}
          {s.sales.map((p, i) => (
            <circle key={i} cx={x(p.date)} cy={y(p.price.toNumber())} r={3.5} className={lastCost && p.price.lt(steps.findLast((c) => c.date <= p.date)?.price ?? 0) ? "fill-red-600" : "fill-brand-500/35"} />
          ))}
          <path d={costPath} fill="none" strokeWidth={2.5} className="stroke-red-600" />
          <path d={avgPath} fill="none" strokeWidth={2.5} strokeLinejoin="round" className="stroke-brand-500" />
        </svg>
      </div>
      <p className="mt-2 text-sm text-slate-600">
        {lastAvg && lastCost
          ? t("Selling at about EGP {price} per {unit} this month against a landed cost of EGP {cost}: a margin of {pct}.", {
              price: money(lastAvg, 0),
              unit,
              cost: money(lastCost, 0),
              pct: `${(((lastAvg - lastCost.toNumber()) / lastAvg) * 100).toFixed(1)}%`,
            })
          : t("Red dots are sales made below the landed cost of the batch in stock at the time.")}
        {" "}{lastAvg && lastCost ? t("Red dots are sales made below the landed cost of the batch in stock at the time.") : ""}
      </p>
    </Card>
  );
}
