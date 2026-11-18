import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireAdmin } from "@/lib/auth";

/** The online inbox's code, to paste into a Cloudflare Worker (see Settings → Sales reps). */
export async function GET() {
  await requireAdmin();
  const code = await readFile(path.join(process.cwd(), "inbox", "viochem-inbox.js"), "utf8");
  return new Response(code, {
    headers: { "Content-Type": "text/javascript; charset=utf-8", "Content-Disposition": 'attachment; filename="viochem-inbox.js"', "Cache-Control": "no-store" },
  });
}
