"use client";

import { buttonClass } from "@/components/ui";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className={buttonClass()}>
      Print or save as PDF
    </button>
  );
}
