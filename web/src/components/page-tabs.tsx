"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { useT } from "@/i18n/client";

/**
 * Pages kept open as tabs along the top, as in a browser. Clicking a link changes the current tab;
 * Ctrl-click, a middle click or "Open in new tab" on a right-click opens it in a new one.
 * The tabs are kept in this computer's storage, so they are still there the next time VIOCHEM opens.
 */
type Tab = { id: string; href: string; title: string };
type State = { tabs: Tab[]; active: string };

const KEY = "viochem-tabs";
const MAX = 12;
const newId = () => Math.random().toString(36).slice(2, 10);

function load(): State | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as State | null;
    return s && Array.isArray(s.tabs) && s.tabs.length ? s : null;
  } catch {
    return null;
  }
}

function save(s: State) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage can be refused; the tabs then last until the page is reloaded.
  }
}

/** The tab being shown, so each tab can keep its own back-link trail. */
export function activeTabId(): string {
  return load()?.active ?? "";
}

/** The heading of the page on screen, without its status badges. */
export function pageTitle(): string {
  const h1 = document.querySelector("main h1")?.cloneNode(true) as HTMLElement | undefined;
  h1?.querySelectorAll("[data-badge]").forEach((b) => b.remove());
  return h1?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

/** What a document's number is shown after, so "← 392" reads "← Invoice 392". */
const KIND: [string, string][] = [
  ["/invoices/", "Invoice"],
  ["/requests/", "Customer request"],
  ["/quotes/", "Quotation"],
  ["/credit-notes/", "Credit note"],
  ["/purchase-orders/", "Purchase order"],
  ["/shipments/", "Shipment"],
  ["/rfqs/", "Request for quotation"],
  ["/cheques/", "Cheque"],
  ["/ledger/journal/", "Journal entry"],
];

/** A page's name for a tab or a back link: its heading, after the kind of document for a bare number. */
export function pageLabel(path: string, title: string, t: (s: string) => string): string {
  const kind = KIND.find(([prefix]) => path.startsWith(prefix))?.[1];
  return kind ? `${t(kind)} ${title}` : title;
}

/** Only pages of the app open in tabs: not print pages, downloads or other websites. */
function tabbable(href: string | null): href is string {
  return !!href && href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/print/") && !href.startsWith("/export/") && !href.startsWith("/api/") && !href.includes("/documents/") && !href.includes("/sheet");
}

export function PageTabs() {
  const t = useT();
  const router = useRouter();
  const path = usePathname();
  const search = useSearchParams().toString();
  const here = search ? `${path}?${search}` : path;
  const [state, setState] = useState<State | null>(null);
  const stateRef = useRef<State | null>(null);

  const update = useCallback((next: State) => {
    stateRef.current = next;
    save(next);
    setState(next);
  }, []);

  // Start from the tabs left open last time, showing this page in the tab that has it, or in the current one.
  // Then keep the current tab on whatever page it navigates to.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      let s = stateRef.current;
      if (!s) {
        s = load() ?? { tabs: [{ id: newId(), href: here, title: "" }], active: "" };
        if (!s.tabs.some((x) => x.id === s!.active)) s.active = s.tabs[0].id;
        const showing = s.tabs.find((x) => x.href === here);
        const last = s.tabs.find((x) => x.id === s!.active)!;
        if (showing) s.active = showing.id;
        else if (here === "/" && last.href !== "/") {
          // VIOCHEM opens on the dashboard: carry on where the last tab was instead.
          update(s);
          router.replace(last.href);
          return;
        }
      }
      const title = pageTitle();
      const tabs = s.tabs.map((x) => (x.id === s.active ? { ...x, href: here, title: title || x.title } : x));
      update({ tabs, active: s.active });
    });
    return () => cancelAnimationFrame(id);
  }, [here, update, router]);

  const open = useCallback(
    (href: string, title = "") => {
      const s = stateRef.current;
      if (!s) return;
      if (s.tabs.length >= MAX) return;
      const tab = { id: newId(), href, title };
      const at = s.tabs.findIndex((x) => x.id === s.active);
      const tabs = [...s.tabs.slice(0, at + 1), tab, ...s.tabs.slice(at + 1)];
      update({ tabs, active: s.active });
    },
    [update],
  );

  // Ctrl-click and middle click on a link open it in a new tab; so does "Open in new tab" in the desktop app's right-click menu.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const background = (e.type === "click" && (e.ctrlKey || e.metaKey)) || (e.type === "auxclick" && e.button === 1);
      if (!background) return;
      const a = (e.target as HTMLElement).closest?.("a");
      const href = a?.getAttribute("href") ?? null;
      if (!a || a.target === "_blank" || !tabbable(href)) return;
      e.preventDefault();
      open(href, a.textContent?.replace(/\s+/g, " ").trim() ?? "");
    };
    const onOpen = (e: Event) => {
      const href = (e as CustomEvent<string>).detail;
      if (tabbable(href)) open(href);
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("auxclick", onClick, true);
    window.addEventListener("viochem-open-tab", onOpen);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("auxclick", onClick, true);
      window.removeEventListener("viochem-open-tab", onOpen);
    };
  }, [open]);

  const show = (tab: Tab) => {
    const s = stateRef.current;
    if (!s || tab.id === s.active) return;
    update({ ...s, active: tab.id });
    router.push(tab.href);
  };

  const close = (tab: Tab) => {
    const s = stateRef.current;
    if (!s || s.tabs.length === 1) return;
    const at = s.tabs.findIndex((x) => x.id === tab.id);
    const tabs = s.tabs.filter((x) => x.id !== tab.id);
    if (tab.id !== s.active) return update({ ...s, tabs });
    const next = tabs[Math.min(at, tabs.length - 1)];
    update({ tabs, active: next.id });
    router.push(next.href);
  };

  const add = () => {
    const s = stateRef.current;
    if (!s || s.tabs.length >= MAX) return;
    const tab = { id: newId(), href: "/", title: t("Dashboard") };
    update({ tabs: [...s.tabs, tab], active: tab.id });
    router.push("/");
  };

  if (!state) return <div className="min-w-0 flex-1" />;
  return (
    <div role="tablist" className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto">
      {state.tabs.map((tab) => {
        const active = tab.id === state.active;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            title={pageLabel(tab.href, tab.title, t)}
            onMouseDown={(e) => e.button === 1 && e.preventDefault()}
            onAuxClick={(e) => e.button === 1 && close(tab)}
            className={`group flex min-w-0 max-w-[13rem] shrink items-center rounded-t-lg border border-b-0 text-sm ${active ? "border-slate-200 bg-slate-50 font-medium text-slate-900" : "border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}
          >
            <button type="button" onClick={() => show(tab)} className="min-w-0 flex-1 truncate py-2 ps-3 pe-1 text-start">
              {tab.title ? pageLabel(tab.href, tab.title, t) : t("Loading…")}
            </button>
            {state.tabs.length > 1 && (
              <button type="button" onClick={() => close(tab)} aria-label={t("Close tab")} className={`me-1.5 rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 ${active ? "" : "opacity-0 group-hover:opacity-100"}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        );
      })}
      {state.tabs.length < MAX && (
        <button type="button" onClick={add} aria-label={t("New tab")} title={t("New tab")} className="mb-1 shrink-0 rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800">
          <Plus className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
