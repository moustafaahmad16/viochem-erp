"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";
import { buttonClass } from "./ui";

/** Copies a text, such as a link to send someone, and says so for a moment. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass("secondary")}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          // Plain http on the office network may not allow the clipboard; select the text instead.
          window.prompt(t("Copy this:"), text);
          return;
        }
        setDone(true);
        setTimeout(() => setDone(false), 2000);
      }}
    >
      {done ? t("Copied") : t(label)}
    </button>
  );
}
