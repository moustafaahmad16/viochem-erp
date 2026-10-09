import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildSheet } from "@/lib/rfq/sheet";

/** The Excel sheet to send suppliers: the same one for all, each writes their name in. */
export async function GET(_: Request, { params }: RouteContext<"/rfqs/[id]/sheet">) {
  if (!(await currentUser())) return new Response("Sign in first", { status: 401 });
  const rfq = await db.rfq.findUnique({ where: { id: Number((await params).id) }, include: { lines: { include: { item: true }, orderBy: { id: "asc" } } } });
  if (!rfq) return new Response("Not found", { status: 404 });
  const file = await buildSheet({ rfq, lines: rfq.lines });
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="VIOCHEM ${rfq.number}.xlsx"`,
    },
  });
}
