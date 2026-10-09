"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { etaSend, etaTextToSign } from "@/app/(app)/eta-actions";
import { useT } from "@/i18n/client";
import { LOCAL_SIGNER } from "@/lib/eta/local";
import type { FormState } from "./forms";
import { buttonClass } from "./ui";

/**
 * Sends an invoice or credit note to the tax authority. When the e-seal is plugged into this computer,
 * the VIOCHEM signer running here signs the document first; the server checks it signed the right one.
 */
export function EtaSend({ kind, id, number, again, mode }: { kind: "invoice" | "credit"; id: number; number: string; again: boolean; mode: "none" | "server" | "browser" }) {
  const t = useT();
  const router = useRouter();
  const [state, setState] = useState<FormState>();
  const [step, setStep] = useState<string | null>(null);

  async function sign(): Promise<{ serialized: string; signature: string } | FormState> {
    setStep("Preparing…");
    const prep = await etaTextToSign(kind, id);
    if ("error" in prep) return { error: prep.error };
    setStep("Signing with the e-seal…");
    let res: Response;
    try {
      res = await fetch(`${LOCAL_SIGNER}/sign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serialized: prep.serialized, label: prep.number }) });
    } catch {
      return { error: "The e-seal signer isn't running on this computer. Start VIOCHEM signer, then send again." };
    }
    const body = (await res.json().catch(() => ({}))) as { signature?: string; error?: string };
    if (!res.ok || !body.signature) return { error: `The e-seal signer couldn't sign it: ${body.error ?? res.status}` };
    return { serialized: prep.serialized, signature: body.signature };
  }

  async function send() {
    if (!window.confirm(t("Send {number} to the tax authority?", { number }))) return;
    setState(undefined);
    try {
      let signed = null;
      if (mode === "browser") {
        const result = await sign();
        if (!result || !("signature" in result)) return setState(result);
        signed = result;
      }
      setStep("Sending…");
      setState(await etaSend(kind, id, signed));
      router.refresh();
    } catch {
      setState({ error: "Something went wrong. Please try again." });
    } finally {
      setStep(null);
    }
  }

  return (
    <div>
      {state?.error && <div role="alert" className="mb-4 whitespace-pre-line rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{t.message(state.error)}</div>}
      {state?.ok && <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{t.message(state.ok)}</div>}
      <button type="button" disabled={!!step} onClick={send} className={buttonClass("primary")}>
        {step ? t(step) : again ? t("Send again") : t("Send to ETA")}
      </button>
      {mode === "browser" && !step && <p className="mt-2 text-xs text-slate-500">{t("Signed by the e-seal on this computer. VIOCHEM signer must be running.")}</p>}
    </div>
  );
}
