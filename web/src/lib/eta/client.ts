import { UserError } from "@/lib/services/errors";
import { serialize, type EtaDocument } from "./document";

/**
 * Talking to the Egyptian Tax Authority. Credentials stay in environment variables, never in the database:
 *   ETA_ENVIRONMENT    "production" or "preprod" (the default, for testing)
 *   ETA_CLIENT_ID      from the ETA portal, under ERP system registration
 *   ETA_CLIENT_SECRET
 *   ETA_SIGNER_URL     optional: a signing service the server can reach, next to the e-seal USB token
 *   ETA_SIGNER_TOKEN   optional password for that service
 *
 * Version 1.0 documents must be signed with the e-seal. Without ETA_SIGNER_URL they are signed in the
 * browser instead, by the VIOCHEM signer running on the computer the token is plugged into.
 */

const HOSTS = {
  preprod: { id: "https://id.preprod.eta.gov.eg", api: "https://api.preprod.invoicing.eta.gov.eg", portal: "https://preprod.invoicing.eta.gov.eg" },
  production: { id: "https://id.eta.gov.eg", api: "https://api.invoicing.eta.gov.eg", portal: "https://invoicing.eta.gov.eg" },
};

export function etaConfig() {
  const environment = process.env.ETA_ENVIRONMENT === "production" ? "production" : "preprod";
  return {
    environment,
    hosts: HOSTS[environment],
    clientId: process.env.ETA_CLIENT_ID ?? "",
    clientSecret: process.env.ETA_CLIENT_SECRET ?? "",
    signerUrl: process.env.ETA_SIGNER_URL ?? "",
    signerToken: process.env.ETA_SIGNER_TOKEN ?? "",
  } as const;
}

/** Where signatures come from: none for version 0.9, a service the server calls, or the signer next to the browser. */
export function signingMode(version: string): "none" | "server" | "browser" {
  if (version === "0.9") return "none";
  return etaConfig().signerUrl ? "server" : "browser";
}

/** Link anyone can open to see the document on the ETA portal. */
export const shareUrl = (uuid: string, longId: string) => `${etaConfig().hosts.portal}/print/documents/${uuid}/share/${longId}`;

async function call(url: string, init: RequestInit) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
  } catch (e) {
    throw new UserError(`Couldn't reach the tax authority (${(e as Error).message}). Try again in a few minutes.`);
  }
}

export async function accessToken(): Promise<string> {
  const c = etaConfig();
  if (!c.clientId || !c.clientSecret) throw new UserError("The ETA client ID and secret aren't set. Add ETA_CLIENT_ID and ETA_CLIENT_SECRET in Vercel.");
  const res = await call(`${c.hosts.id}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: c.clientId, client_secret: c.clientSecret, scope: "InvoicingAPI" }),
  });
  if (!res.ok) throw new UserError(`The tax authority refused the login (${res.status}). Check ETA_CLIENT_ID and ETA_CLIENT_SECRET.`);
  return (await res.json()).access_token;
}

/** The issuer signature for a version 1.0 document, from the signing service that holds the e-seal. */
export async function sign(doc: EtaDocument): Promise<string | null> {
  if (doc.documentTypeVersion === "0.9") return null;
  const c = etaConfig();
  if (!c.signerUrl) throw new UserError("Version 1.0 invoices must be signed with VIOCHEM's e-seal. Set ETA_SIGNER_URL to the signing service, or use version 0.9 while testing.");
  const res = await call(c.signerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.signerToken}` },
    body: JSON.stringify({ serialized: serialize(doc) }),
  });
  if (!res.ok) throw new UserError(`The signing service failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).signature;
}

export type SubmitResult = { accepted: { uuid: string; longId: string; internalId: string }[]; rejected: { internalId: string; error: unknown }[]; submissionId: string | null; status: number; body: unknown };

export async function submit(documents: object[]): Promise<SubmitResult> {
  const res = await call(`${etaConfig().hosts.api}/api/v1.0/documentsubmissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await accessToken()}` },
    body: JSON.stringify({ documents }),
  });
  const body = await res.json().catch(() => null);
  return {
    accepted: body?.acceptedDocuments ?? [],
    rejected: body?.rejectedDocuments ?? [],
    submissionId: body?.submissionId ?? body?.submissionUUID ?? null,
    status: res.status,
    body,
  };
}

/** ETA's current verdict on a document: Submitted, Valid, Invalid, Rejected or Cancelled. */
export async function documentStatus(uuid: string): Promise<{ status: string; errors: unknown }> {
  const res = await call(`${etaConfig().hosts.api}/api/v1.0/documents/${uuid}/details`, { headers: { Authorization: `Bearer ${await accessToken()}` } });
  if (!res.ok) throw new UserError(`The tax authority couldn't find that document (${res.status}).`);
  const body = await res.json();
  return { status: body.status, errors: body.validationResults };
}

export async function cancelDocument(uuid: string, reason: string) {
  const res = await call(`${etaConfig().hosts.api}/api/v1.0/documents/state/${uuid}/state`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await accessToken()}` },
    body: JSON.stringify({ status: "cancelled", reason }),
  });
  if (!res.ok) throw new UserError(`The tax authority didn't cancel it (${res.status}): ${(await res.text()).slice(0, 300)}`);
}
