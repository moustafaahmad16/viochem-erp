import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildSheet } from "@/lib/rfq/sheet";
import { markSent } from "@/lib/services/rfq";

/** The Excel sheet to send one supplier, with any prices they already gave filled in. */
export async function GET(_: Request, { params }: RouteContext<"/rfqs/[id]/sheet/[supplierId]">) {
  if (!(await currentUser())) return new Response("Sign in first", { status: 401 });
  const { id, supplierId } = await params;
  const rfq = await db.rfq.findUnique({ where: { id: Number(id) }, include: { lines: { include: { item: true }, orderBy: { id: "asc" } } } });
  const invited = rfq && (await db.rfqSupplier.findUnique({ where: { rfqId_supplierId: { rfqId: rfq.id, supplierId: Number(supplierId) } }, include: { supplier: true } }));
  if (!rfq || !invited) return new Response("Not found", { status: 404 });
  const quotes = await db.rfqQuote.findMany({ where: { rfqId: rfq.id, supplierId: invited.supplierId } });
  const file = await buildSheet({
    rfq,
    supplier: invited.supplier,
    lines: rfq.lines,
    quotes: new Map(
      quotes.map((q) => [
        q.rfqLineId,
        {
          unitPrice: Number(q.unitPrice),
          currency: q.currency,
          moq: q.moq === null ? null : Number(q.moq),
          leadTimeDays: q.leadTimeDays,
          paymentTermsDays: q.paymentTermsDays,
          validUntil: q.validUntil,
          incoterm: q.incoterm,
          notes: q.notes,
        },
      ]),
    ),
  });
  await markSent(rfq.id, invited.supplierId);
  const name = `${rfq.number} ${invited.supplier.name}`.replace(/[^\w.-]+/g, "-");
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}.xlsx"`,
    },
  });
}
