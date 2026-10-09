"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BarChart3, Boxes, Building2, CalendarClock, FlaskConical, LayoutDashboard, Receipt, Settings, Ship, Upload, Users, type LucideIcon } from "lucide-react";

const SECTIONS: { title: string; links: { href: string; label: string; icon: LucideIcon }[] }[] = [
  { title: "", links: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }] },
  { title: "Sales", links: [{ href: "/invoices", label: "Invoices", icon: Receipt }, { href: "/customers", label: "Customers", icon: Users }] },
  { title: "Imports", links: [{ href: "/shipments", label: "Shipments", icon: Ship }, { href: "/suppliers", label: "Suppliers", icon: Building2 }] },
  { title: "Stock", links: [{ href: "/stock", label: "Stock on hand", icon: Boxes }, { href: "/products", label: "Products", icon: FlaskConical }, { href: "/import", label: "Import from Excel", icon: Upload }] },
  { title: "Reports", links: [{ href: "/reports/margin", label: "Margins", icon: BarChart3 }, { href: "/reports/expiry", label: "Expiring lots", icon: CalendarClock }] },
];

export function Nav({ user, isAdmin, logout }: { user: string; isAdmin: boolean; logout: () => Promise<void> }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const sections = isAdmin ? [...SECTIONS, { title: "Settings", links: [{ href: "/users", label: "Users", icon: Settings }] }] : SECTIONS;

  return (
    <>
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <span className="font-bold text-brand-700">VIOCHEM</span>
        <button onClick={() => setOpen(!open)} className="rounded-md border border-slate-300 px-2.5 py-1 text-sm" aria-label="Menu">
          ☰
        </button>
      </div>
      <aside
        className={`${open ? "block" : "hidden"} fixed inset-y-0 left-0 z-30 w-60 overflow-y-auto border-r border-slate-200 bg-white lg:block`}
        onClick={() => setOpen(false)}
      >
        <div className="px-5 py-5">
          <Link href="/" className="text-xl font-bold tracking-tight text-brand-700">
            VIOCHEM
          </Link>
        </div>
        <nav className="space-y-5 px-3 pb-24">
          {sections.map((s) => (
            <div key={s.title}>
              {s.title && <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{s.title}</div>}
              {s.links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm ${active(l.href) ? "bg-brand-50 font-medium text-brand-700" : "text-slate-700 hover:bg-slate-50"}`}
                >
                  <l.icon className={`h-4 w-4 ${active(l.href) ? "text-brand-600" : "text-slate-400"}`} strokeWidth={1.75} />
                  {l.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="absolute inset-x-0 bottom-0 border-t border-slate-100 bg-white px-5 py-3 text-sm">
          <div className="truncate text-slate-700">{user}</div>
          <form action={logout}>
            <button className="text-slate-500 hover:text-slate-800">Sign out</button>
          </form>
        </div>
      </aside>
    </>
  );
}
