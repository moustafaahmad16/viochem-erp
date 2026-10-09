import { describe, expect, it } from "vitest";
import { translator } from "@/i18n/core";
import { ar } from "@/i18n/ar";

describe("translation", () => {
  const t = translator("ar");

  it("looks up text, and falls back to English when there is no Arabic yet", () => {
    expect(t("Invoices")).toBe("الفواتير");
    expect(t("Something nobody translated")).toBe("Something nobody translated");
    expect(translator("en")("Invoices")).toBe("Invoices");
  });

  it("translates messages with values in them, and their values when it can", () => {
    expect(t.message("Name is required.")).toBe("الاسم مطلوب.");
    expect(t.message("Wrong email or password. Something else.")).toBe("البريد الإلكتروني أو كلمة المرور غير صحيحة. Something else.");
  });

  it("writes dates with Arabic month names", () => {
    expect(t.date(new Date("2026-10-08T00:00:00Z"))).toBe("08 أكتوبر 2026");
    expect(translator("en").date(new Date("2026-10-08T00:00:00Z"))).toBe("08 Oct 2026");
  });

  it("keeps every placeholder in the Arabic", () => {
    for (const [en, tr] of Object.entries(ar)) {
      const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect([en, names(tr)]).toEqual([en, names(en)]);
    }
  });
});
