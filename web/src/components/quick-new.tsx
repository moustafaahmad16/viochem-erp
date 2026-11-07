"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BadgeCheck, Building2, ClipboardList, FileSearch, FileText, FlaskConical, NotebookPen, Plus, Receipt, ReceiptText, Ship, Users, type LucideIcon } from "lucide-react";
import { useT } from "@/i18n/client";

type Entry = { href: string; label: string; icon: LucideIcon; admin?: boolean };

const GROUPS: { title: string; links: Entry[] }[] = [
  {
    title: "Sales",
    links: [
      { href: "/quotes/new", label: "Quotation", icon: FileText },
      { href: "/invoices/new", label: "Invoice", icon: Receipt },
      { href: "/cheques/new?direction=received", label: "Receive a cheque", icon: BadgeCheck },
      { href: "/customers#add", label: "Customer", icon: Users },
    ],
  },
  {
    title: "Imports",
    links: [
      { href: "/rfqs/new", label: "Request for quotation", icon: FileSearch },
      { href: "/purchase-orders/new", label: "Purchase order", icon: ClipboardList },
      { href: "/shipments/new", label: "Shipment", icon: Ship },
      { href: "/cheques/new?direction=issued", label: "Issue a cheque", icon: BadgeCheck },
      { href: "/suppliers#add", label: "Supplier", icon: Building2 },
    ],
  },
  {
    title: "Other",
    links: [
      { href: "/expenses#add", label: "Expense", icon: ReceiptText },
      { href: "/products/new", label: "Product", icon: FlaskConical },
      { href: "/ledger/journal/new", label: "Journal entry", icon: NotebookPen, admin: true },
    ],
  },
];

/** A "+ New" button that starts any document from any page. */
export function QuickNew({ isAdmin, className = "" }: { isAdmin: boolean; className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={box} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
      >
        <Plus className="h-4 w-4" strokeWidth={2} />
        {t("New")}
      </button>
      {open && (
        <div role="menu" className="absolute end-0 z-40 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          {GROUPS.map((g) => (
            <div key={g.title} className="py-1">
              <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-brand-900/50">{t(g.title)}</div>
              {g.links
                .filter((l) => isAdmin || !l.admin)
                .map((l) => (
                  <Link key={l.href} href={l.href} role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                    <l.icon className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={1.75} />
                    {t(l.label)}
                  </Link>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
