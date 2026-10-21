import { db } from "@/lib/db";

/** For the Windows app to know the server is up, and for monitoring the website. */
export async function GET() {
  await db.user.count();
  return Response.json({ ok: true });
}
