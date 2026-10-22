"use client";

import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/ui";
import { useT } from "@/i18n/client";

/** Back and print, above every printable page. The Windows app has no browser back button. */
export function PrintButton() {
  const t = useT();
  const router = useRouter();
  return (
    <div className="flex w-full justify-between gap-3">
      <button onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))} className={buttonClass("secondary")}>
        {t("← Back")}
      </button>
      <button onClick={() => window.print()} className={buttonClass()}>
        {t("Print or save as PDF")}
      </button>
    </div>
  );
}
