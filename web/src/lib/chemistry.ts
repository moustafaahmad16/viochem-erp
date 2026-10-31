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
