"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BarChart3, Boxes, Building2, CalendarClock, FlaskConical, LayoutDashboard, Receipt, Settings, Ship, Upload, Users, FileCheck, Wallet, HandCoins, Landmark, ReceiptText, TrendingUp, type LucideIcon } from "lucide-react";

const SECTIONS: { title: string; links: { href: string; label: string; icon: LucideIcon }[] }[] = [
  { title: "", links: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }] },
  { title: "Sales", links: [{ href: "/invoices", label: "Invoices", icon: Receipt }, { href: "/customers", label: "Customers", icon: Users }] },
  { title: "Imports", links: [{ href: "/shipments", label: "Shipments", icon: Ship }, { href: "/suppliers", label: "Suppliers", icon: Building2 }] },
  { title: "Money", links: [{ href: "/receivables", label: "Owed to you", icon: Wallet }, { href: "/payables", label: "You owe", icon: HandCoins }, { href: "/accounts", label: "Bank & cash", icon: Landmark }, { href: "/expenses", label: "Expenses", icon: ReceiptText }] },
  { title: "Stock", links: [{ href: "/stock", label: "Stock on hand", icon: Boxes }, { href: "/products", label: "Products", icon: FlaskConical }, { href: "/import", label: "Import from Excel", icon: Upload }] },
  { title: "Reports", links: [{ href: "/reports/profit", label: "Profit and loss", icon: TrendingUp }, { href: "/reports/margin", label: "Margins", icon: BarChart3 }, { href: "/reports/expiry", label: "Expiring lots", icon: CalendarClock }] },
];

export function Nav({ user, isAdmin, logout }: { user: string; isAdmin: boolean; logout: () => Promise<void> }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const sections = isAdmin ? [...SECTIONS, { title: "Settings", links: [{ href: "/users", label: "Users", icon: Settings }, { href: "/settings/eta", label: "E-invoice", icon: FileCheck }] }] : SECTIONS;

  return (
    <>
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Viochem" className="h-8 w-auto" />
        <button onClick={() => setOpen(!open)} className="rounded-md border border-slate-300 px-2.5 py-1 text-sm" aria-label="Menu">
          ☰
        </button>
      </div>
      <aside
        className={`${open ? "flex" : "hidden"} fixed inset-y-0 left-0 z-30 w-60 flex-col border-r border-slate-200 bg-white lg:flex`}
        onClick={() => setOpen(false)}
      >
        <div className="shrink-0 px-5 py-5">
          <Link href="/" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Viochem" className="h-14 w-auto" />
          </Link>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
          {sections.map((s) => (
            <div key={s.title}>
              {s.title && <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-brand-900/50">{s.title}</div>}
              {s.links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`flex items-center gap-2.5 rounded-lg border-l-[3px] px-2 py-1.5 text-sm ${active(l.href) ? "border-accent-500 bg-brand-50 font-medium text-brand-700" : "border-transparent text-slate-700 hover:bg-slate-50"}`}
                >
                  <l.icon className={`h-4 w-4 ${active(l.href) ? "text-accent-600" : "text-slate-400"}`} strokeWidth={1.75} />
                  {l.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-3 text-sm">
          <div className="truncate text-slate-700">{user}</div>
          <form action={logout}>
            <button className="text-slate-500 hover:text-slate-800">Sign out</button>
          </form>
        </div>
      </aside>
    </>
  );
}
