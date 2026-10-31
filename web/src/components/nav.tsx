"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useT } from "@/i18n/client";
import { LangSwitch } from "@/i18n/switch";
import { BarChart3, Boxes, Building2, CalendarClock, FlaskConical, LayoutDashboard, Receipt, Settings, Ship, Upload, Users, FileCheck, Wallet, HandCoins, FileText, Undo2, ClipboardList, BadgeCheck, PackageMinus, Landmark, ReceiptText, TrendingUp, ListTree, NotebookPen, Scale, BookOpen, FileSearch, HardDrive, Trash2, Percent, type LucideIcon } from "lucide-react";

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
  { title: "Reports", links: [{ href: "/reports/margin", label: "Margins", icon: BarChart3 }, { href: "/reports/expiry", label: "Expiring lots", icon: CalendarClock }, { href: "/reports/low-stock", label: "Low stock", icon: PackageMinus }, { href: "/reports/wht", label: "Withholding tax", icon: Percent }] },
];

/** Hidden while the wide-screen bar is slim, shown once it slides open. */
const REVEAL = "lg:opacity-0 lg:transition-opacity lg:group-hover/nav:opacity-100 lg:group-focus-within/nav:opacity-100";

export function Nav({ user, isAdmin, desktop, logout }: { user: string; isAdmin: boolean; desktop: boolean; logout: () => Promise<void> }) {
  const path = usePathname();
  const t = useT();
  const [open, setOpen] = useState(false);
  const settings = [{ href: "/users", label: "Users", icon: Settings }, { href: "/settings/eta", label: "E-invoice", icon: FileCheck }];
  if (desktop) settings.push({ href: "/settings/desktop", label: "Sharing and backups", icon: HardDrive });
  settings.push({ href: "/settings/data", label: "Clear all data", icon: Trash2 });
  const sections = isAdmin ? [...SECTIONS, { title: "Settings", links: settings }] : SECTIONS;
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
      {/* On wide screens: a slim bar of icons that slides open over the page while the mouse is on it (or a link has keyboard focus). */}
      <aside
        className={`${open ? "flex" : "hidden"} group/nav fixed inset-y-0 start-0 z-30 w-60 flex-col overflow-hidden border-e border-slate-200 bg-white lg:flex lg:w-16 lg:transition-[width,box-shadow] lg:duration-200 lg:hover:w-60 lg:hover:shadow-xl lg:hover:delay-100 lg:focus-within:w-60 lg:focus-within:shadow-xl`}
        onClick={() => setOpen(false)}
      >
        <div className="shrink-0 px-5 py-5 lg:px-3">
          <Link href="/" className="block overflow-hidden" dir="ltr">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Viochem" className="h-14 w-auto max-w-none lg:mt-3 lg:h-auto lg:w-10 lg:group-hover/nav:mt-0 lg:group-hover/nav:h-14 lg:group-hover/nav:w-auto lg:group-focus-within/nav:mt-0 lg:group-focus-within/nav:h-14 lg:group-focus-within/nav:w-auto" />
          </Link>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-3 pb-4">
          {sections.map((s) => (
            <div key={s.title}>
              {s.title && <div className={`whitespace-nowrap px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-brand-900/50 ${REVEAL}`}>{t(s.title)}</div>}
              {s.links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-label={t(l.label)}
                  className={`flex items-center gap-2.5 rounded-lg border-s-[3px] px-2 py-1.5 text-sm ${active(l.href) ? "border-accent-500 bg-brand-50 font-medium text-brand-700" : "border-transparent text-slate-700 hover:bg-slate-50"}`}
                >
                  <l.icon className={`h-4 w-4 shrink-0 ${active(l.href) ? "text-accent-600" : "text-slate-400"}`} strokeWidth={1.75} />
                  <span className={`whitespace-nowrap ${REVEAL}`}>{t(l.label)}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className={`shrink-0 border-t border-slate-100 bg-white px-5 py-3 text-sm lg:w-60 ${REVEAL}`}>
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
