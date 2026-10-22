import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

/** One of a shipment's documents, opened in the browser when it can show it. */
export async function GET(_: Request, { params }: RouteContext<"/shipments/[id]/documents/[docId]">) {
  if (!(await currentUser())) return new Response("Sign in first", { status: 401 });
  const { id, docId } = await params;
  const doc = await db.shipmentDocument.findFirst({ where: { id: Number(docId) || 0, shipmentId: Number(id) || 0 } });
  if (!doc) return new Response("Not found", { status: 404 });
  const ascii = doc.fileName.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return new Response(new Uint8Array(doc.content), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
      // A file someone uploaded must never run as a page of the app.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Cache-Control": "private, no-store",
    },
  });
}
