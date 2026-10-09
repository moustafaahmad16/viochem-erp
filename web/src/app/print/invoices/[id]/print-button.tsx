"use client";

import { buttonClass } from "@/components/ui";
import { useT } from "@/i18n/client";

export function PrintButton() {
  const t = useT();
  return (
    <button onClick={() => window.print()} className={buttonClass()}>
      {t("Print or save as PDF")}
    </button>
  );
}
