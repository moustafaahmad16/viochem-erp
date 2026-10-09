"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useT } from "@/i18n/client";
import { LangSwitch } from "@/i18n/switch";
import { BarChart3, Boxes, Building2, CalendarClock, FlaskConical, LayoutDashboard, Receipt, Settings, Ship, Upload, Users, FileCheck, Wallet, HandCoins, FileText, Undo2, ClipboardList, BadgeCheck, PackageMinus, Landmark, ReceiptText, TrendingUp, ListTree, NotebookPen, Scale, BookOpen, FileSearch, type LucideIcon } from "lucide-react";

const SECTIONS: { title: string; links: { href: string; label: string; icon: LucideIcon }[] }[] = [
  { title: "", links: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }] },
  {
    title: "Sales",
    links: [
      { href: "/quotes", label: "Quotations", icon: FileText },
      { href: "/invoices", label: "Invoices", icon: Receipt },
      { href: "/credit-notes", label: "Credit notes", icon: Undo2 },
      { href: "/customers", label: "Customers", icon: Users },
    ],
  },
  {
    title: "Imports",
    links: [
      { href: "/rfqs", label: "Requests for quotation", icon: FileSearch },
      { href: "/purchase-orders", label: "Purchase orders", icon: ClipboardList },
      { href: "/shipments", label: "Shipments", icon: Ship },
      { href: "/suppliers", label: "Suppliers", icon: Building2 },
    ],
  },
  { title: "Money", links: [{ href: "/receivables", label: "Owed to you", icon: Wallet }, { href: "/payables", label: "You owe", icon: HandCoins }, { href: "/accounts", label: "Bank & cash", icon: Landmark }, { href: "/cheques", label: "Cheques", icon: BadgeCheck }, { href: "/expenses", label: "Expenses", icon: ReceiptText }] },
  { title: "Stock", links: [{ href: "/stock", label: "Stock on hand", icon: Boxes }, { href: "/products", label: "Products", icon: FlaskConical }, { href: "/import", label: "Import from Excel", icon: Upload }] },
  {
    title: "Accounting",
    links: [
      { href: "/reports/profit", label: "Profit and loss", icon: TrendingUp },
      { href: "/ledger/balance-sheet", label: "Balance sheet", icon: Scale },
      { href: "/ledger/trial-balance", label: "Trial balance", icon: ListTree },
      { href: "/ledger/journal", label: "Journal", icon: NotebookPen },
      { href: "/ledger", label: "Chart of accounts", icon: BookOpen },
    ],
  },
  { title: "Reports", links: [{ href: "/reports/margin", label: "Margins", icon: BarChart3 }, { href: "/reports/expiry", label: "Expiring lots", icon: CalendarClock }, { href: "/reports/low-stock", label: "Low stock", icon: PackageMinus }] },
];

export function Nav({ user, isAdmin, logout }: { user: string; isAdmin: boolean; logout: () => Promise<void> }) {
  const path = usePathname();
  const t = useT();
  const [open, setOpen] = useState(false);
  const sections = isAdmin ? [...SECTIONS, { title: "Settings", links: [{ href: "/users", label: "Users", icon: Settings }, { href: "/settings/eta", label: "E-invoice", icon: FileCheck }] }] : SECTIONS;
  // The closest match wins, so /ledger/journal lights up Journal and not Chart of accounts.
  const current = sections
    .flatMap((s) => s.links.map((l) => l.href))
    .filter((h) => (h === "/" ? path === "/" : path === h || path.startsWith(`${h}/`)))
    .sort((a, b) => b.length - a.length)[0];
  const active = (href: string) => href === current;

  return (
    <>
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Viochem" className="h-8 w-auto" />
        <button onClick={() => setOpen(!open)} className="rounded-md border border-slate-300 px-2.5 py-1 text-sm" aria-label={t("Menu")}>
          ☰
        </button>
      </div>
      <aside
        className={`${open ? "flex" : "hidden"} fixed inset-y-0 start-0 z-30 w-60 flex-col border-e border-slate-200 bg-white lg:flex`}
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
              {s.title && <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-brand-900/50">{t(s.title)}</div>}
              {s.links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`flex items-center gap-2.5 rounded-lg border-s-[3px] px-2 py-1.5 text-sm ${active(l.href) ? "border-accent-500 bg-brand-50 font-medium text-brand-700" : "border-transparent text-slate-700 hover:bg-slate-50"}`}
                >
                  <l.icon className={`h-4 w-4 ${active(l.href) ? "text-accent-600" : "text-slate-400"}`} strokeWidth={1.75} />
                  {t(l.label)}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-slate-700">{user}</div>
            <LangSwitch />
          </div>
          <form action={logout}>
            <button className="text-slate-500 hover:text-slate-800">{t("Sign out")}</button>
          </form>
        </div>
      </aside>
    </>
  );
}
