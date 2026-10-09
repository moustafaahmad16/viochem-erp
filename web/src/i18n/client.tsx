"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { translator, type Lang } from "./core";

const LangContext = createContext<Lang>("en");

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useT() {
  const lang = useContext(LangContext);
  return useMemo(() => translator(lang), [lang]);
}
