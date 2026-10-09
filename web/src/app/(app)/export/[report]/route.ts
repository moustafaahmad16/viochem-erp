import { getT } from "@/i18n/server";
import { currentUser } from "@/lib/auth";
import { buildReport } from "@/lib/reports/definitions";
import { reportWorkbook } from "@/lib/reports/xlsx";

/** A report as an Excel file, with the same filters as the page it was downloaded from. */
export async function GET(req: Request, { params }: RouteContext<"/export/[report]">) {
  if (!(await currentUser())) return new Response("Sign in first", { status: 401 });
  const t = await getT();
  const report = await buildReport((await params).report, new URL(req.url).searchParams, t).catch(() => null);
  if (!report) return new Response("Not found", { status: 404 });
  const file = await reportWorkbook(report, t.dir === "rtl");
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="VIOCHEM ${report.file}.xlsx"`,
    },
  });
}
