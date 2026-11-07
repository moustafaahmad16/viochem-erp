"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useT } from "@/i18n/client";

/**
 * The pages visited in this tab, oldest first, so a page's back link can return to where you came from
 * (the customer you opened an invoice from) instead of always to the list.
 */
type Step = { path: string; href: string; title: string };
const KEY = "viochem-trail";

function readTrail(): Step[] {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as Step[];
  } catch {
    return [];
  }
}

function writeTrail(trail: Step[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(trail.slice(-20)));
  } catch {
    // Private windows can refuse storage; back links then go to the list as before.
  }
}

/** Forms for new documents send you on to the saved document, so they are left out of the trail. */
const skip = (path: string) => path.endsWith("/new") || path.startsWith("/print/");

/** Records each page as it is opened. Rendered once, in the app's layout. */
export function TrailRecorder() {
  const path = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    if (skip(path)) return;
    const href = search ? `${path}?${search}` : path;
    // Wait a frame so the new page's heading is on screen.
    const id = requestAnimationFrame(() => {
      // The page's heading without its status badges: "392", not "392 Posted".
      const h1 = document.querySelector("main h1")?.cloneNode(true) as HTMLElement | undefined;
      h1?.querySelectorAll("[data-badge]").forEach((b) => b.remove());
      const title = h1?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const trail = readTrail();
      const at = trail.findLastIndex((s) => s.path === path);
      // Going back to a page already in the trail drops what came after it; switching tabs on a page just updates it.
      if (at >= 0) trail.splice(at);
      trail.push({ path, href, title });
      writeTrail(trail);
    });
    return () => cancelAnimationFrame(id);
  }, [path, search]);
  return null;
}

/** What a document's number is shown after, so "← 392" reads "← Invoice 392". */
const KIND: [string, string][] = [
  ["/invoices/", "Invoice"],
  ["/quotes/", "Quotation"],
  ["/credit-notes/", "Credit note"],
  ["/purchase-orders/", "Purchase order"],
  ["/shipments/", "Shipment"],
  ["/rfqs/", "Request for quotation"],
  ["/cheques/", "Cheque"],
  ["/ledger/journal/", "Journal entry"],
];

/** "← Back" to the page you came from, or to the given page when you arrived here directly. */
export function BackLink({ href, label }: { href: string; label: string }) {
  const path = usePathname();
  const t = useT();
  const [back, setBack] = useState({ href, label });
  useEffect(() => {
    const trail = readTrail();
    const here = trail.findLastIndex((s) => s.path === path);
    const prev = here > 0 ? trail[here - 1] : here === -1 ? trail.at(-1) : undefined;
    if (prev && prev.title && prev.path !== path && prev.path !== href.split("?")[0]) {
      const kind = KIND.find(([prefix]) => prev.path.startsWith(prefix))?.[1];
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the trail lives in the browser's storage, so it can only be read after the page loads
      setBack({ href: prev.href, label: kind ? `${t(kind)} ${prev.title}` : prev.title });
    }
  }, [path, href, t]);
  return (
    <Link href={back.href} className="mb-2 inline-block text-sm text-slate-500 hover:text-slate-800">
      <span className="inline-block rtl:rotate-180">←</span> {back.label}
    </Link>
  );
}
