import { ar } from "./ar";

/**
 * Arabic and English. Text is written in English in the code and looked up in the Arabic
 * dictionary when Arabic is chosen, so anything not translated yet still shows, in English.
 * Placeholders like {name} are filled in after the lookup.
 */

export type Lang = "en" | "ar";
export const LANGS: Lang[] = ["en", "ar"];
export const LANG_COOKIE = "viochem_lang";

type Vars = Record<string, string | number>;
export type T = ((text: string, vars?: Vars) => string) & {
  lang: Lang;
  dir: "ltr" | "rtl";
  /** "08 Oct 2026" or "08 أكتوبر 2026". */
  date: (d: Date | null | undefined) => string;
  /** A message built in English with values in it, like an error from the server. */
  message: (text: string) => string;
};

const MONTHS: Record<Lang, string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  ar: ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"],
};

const fill = (text: string, vars?: Vars) => (vars ? text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text);

// Dictionary entries with placeholders, as patterns that pick the values back out of a message.
let patterns: { re: RegExp; names: string[]; ar: string }[] | null = null;
function templates() {
  if (!patterns) {
    patterns = Object.entries(ar)
      .filter(([en]) => /\{\w+\}/.test(en))
      .map(([en, tr]) => {
        const names: string[] = [];
        const source = en
          .split(/(\{\w+\})/)
          .map((part) => {
            const m = /^\{(\w+)\}$/.exec(part);
            if (m) {
              names.push(m[1]);
              return "(.+?)";
            }
            return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          })
          .join("");
        return { re: new RegExp(`^${source}$`, "s"), names, ar: tr };
      });
  }
  return patterns;
}

export function translator(lang: Lang): T {
  const t = ((text: string, vars?: Vars) => fill(lang === "ar" ? (ar[text] ?? text) : text, vars)) as T;
  t.lang = lang;
  t.dir = lang === "ar" ? "rtl" : "ltr";
  t.date = (d) => (d ? `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[lang][d.getUTCMonth()]} ${d.getUTCFullYear()}` : "");
  t.message = (text) => {
    if (lang !== "ar") return text;
    if (ar[text]) return ar[text];
    if (text.includes("\n")) return text.split("\n").map((l) => t.message(l)).join("\n");
    for (const p of templates()) {
      const m = p.re.exec(text);
      // Values can be messages themselves, like a row's problem in "Row {row}: {message}".
      if (m) return fill(p.ar, Object.fromEntries(p.names.map((n, i) => [n, t.message(m[i + 1])])));
    }
    // Several sentences: translate each one.
    const parts = text.split(/(?<=\.)\s+/);
    return parts.length > 1 ? parts.map((s) => t.message(s)).join(" ") : text;
  };
  return t;
}
