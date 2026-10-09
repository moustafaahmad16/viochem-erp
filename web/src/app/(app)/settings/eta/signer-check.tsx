"use client";

import { useState } from "react";
import { buttonClass } from "@/components/ui";
import { useT } from "@/i18n/client";
import { LOCAL_SIGNER } from "@/lib/eta/local";

/** Asks the signer on this computer which e-seal it holds. */
export function SignerCheck() {
  const t = useT();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function check() {
    setBusy(true);
    try {
      const res = await fetch(`${LOCAL_SIGNER}/status`);
      const body = (await res.json()) as { subject?: string; validUntil?: string; error?: string };
      setResult(res.ok ? { ok: true, text: t("Running. E-seal: {subject}, valid until {date}.", { subject: body.subject ?? "", date: body.validUntil ?? "" }) } : { ok: false, text: t.message(body.error ?? "") });
    } catch {
      setResult({ ok: false, text: t("VIOCHEM signer isn't running on this computer.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <button type="button" onClick={check} disabled={busy} className={buttonClass("secondary")}>
        {t("Check the signer on this computer")}
      </button>
      {result && <p className={`rounded-lg px-3 py-2 text-sm ${result.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{result.text}</p>}
    </div>
  );
}
