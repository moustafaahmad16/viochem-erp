/**
 * Tidy a CAS number pasted from a website, a PDF or a supplier's sheet: those often bring along
 * spaces, invisible characters, long dashes, Arabic digits or a "CAS No." in front. Digits written
 * without dashes (78706) get them back. Anything that still isn't a CAS number is returned as it was
 * typed, trimmed, so the check below can say what's wrong with it.
 */
export function normalizeCas(raw: string): string {
  const s = raw
    .normalize("NFKC")
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, "")
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-")
    .replace(/^\s*CAS\s*[-.]?\s*(?:Reg(?:istry)?\.?\s*)?(?:No|Number|RN)?\.?\s*[#:]?\s*/i, "")
    .replace(/\s+/g, "")
    .replace(/^[-.:]+|[-.:]+$/g, "");
  if (/^\d{5,10}$/.test(s)) return `${s.slice(0, -3)}-${s.slice(-3, -1)}-${s.slice(-1)}`;
  return s;
}

/** CAS numbers look like 78-70-6; the last digit is a check digit. */
export function isValidCas(cas: string): boolean {
  const m = /^(\d{2,7})-(\d{2})-(\d)$/.exec(cas.trim());
  if (!m) return false;
  const digits = (m[1] + m[2]).split("").reverse();
  const sum = digits.reduce((acc, d, i) => acc + Number(d) * (i + 1), 0);
  return sum % 10 === Number(m[3]);
}

/** HS (customs) codes are 4 to 12 digits, often written with dots like 2905.22.00. */
export function isValidHsCode(hs: string): boolean {
  const s = hs.trim();
  return /^\d[\d.\s]*\d$/.test(s) && /^\d{4,12}$/.test(s.replace(/[.\s]/g, ""));
}
