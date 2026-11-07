import Link from "next/link";

/** Pill tabs that switch with ?tab= in the address, so a tab can be bookmarked or shared. The first tab has no key. */
export function TabPills({ tabs, current, href }: { tabs: { key: string; label: string; count?: number }[]; current: string; href: (key: string) => string }) {
  return (
    <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1">
      {tabs.map((x) => (
        <Link key={x.key} href={href(x.key)} scroll={false} className={`rounded-full px-3 py-1 text-sm ${current === x.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-200"}`}>
          {x.label}
          {x.count !== undefined && <span className={`ms-1.5 text-xs ${current === x.key ? "text-white/70" : "text-slate-400"}`}>{x.count}</span>}
        </Link>
      ))}
    </div>
  );
}
