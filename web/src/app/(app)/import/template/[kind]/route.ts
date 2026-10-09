import { currentUser } from "@/lib/auth";
import { template } from "@/lib/import/excel";
import { KINDS, type KindName } from "@/lib/import/kinds";

export async function GET(_: Request, { params }: RouteContext<"/import/template/[kind]">) {
  if (!(await currentUser())) return new Response("Sign in first", { status: 401 });
  const { kind } = await params;
  if (!(kind in KINDS)) return new Response("Not found", { status: 404 });
  const file = await template(kind as KindName);
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="viochem-${kind}-template.xlsx"`,
    },
  });
}
