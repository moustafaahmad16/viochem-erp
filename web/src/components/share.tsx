import type Decimal from "decimal.js";
import { pct } from "@/lib/format";

/** A share of the total, as a small bar under the amount. */
export function Share({ value }: { value: Decimal }) {
  return (
    <div className="mt-1 flex items-center justify-end gap-1.5 text-xs text-slate-500">
      <span className="inline-block h-1 w-12 overflow-hidden rounded bg-slate-100">
        <span className="block h-full bg-accent-500" style={{ width: `${Math.max(0, Math.min(100, value.toNumber()))}%` }} />
      </span>
      {pct(value)}
    </div>
  );
}
