"use client";

import { useTransition } from "react";
import { setLang } from "./actions";
import { useT } from "./client";

/** Switches between Arabic and English, labelled in the language it switches to. */
export function LangSwitch({ className = "" }: { className?: string }) {
  const t = useT();
  const [pending, start] = useTransition();
  const other = t.lang === "ar" ? "en" : "ar";
  return (
    <button
      type="button"
      disabled={pending}
      lang={other}
      onClick={(e) => {
        e.stopPropagation();
        start(() => setLang(other));
      }}
      className={`shrink-0 rounded-md border border-slate-200 px-2 py-0.5 text-xs font-medium text-brand-700 hover:border-accent-500 disabled:opacity-50 ${className}`}
    >
      {other === "ar" ? "العربية" : "English"}
    </button>
  );
}

/** Translated text for server components that render shared pieces without a translator at hand. */
export function Tr({ children, vars }: { children: string; vars?: Record<string, string | number> }) {
  return useT()(children, vars);
}
