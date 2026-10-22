import path from "node:path";
import { db } from "@/lib/db";
import { backupNow, scheduleBackups } from "./backup";
import { migrateSqlite, pendingMigrations } from "./migrate";

export async function startDesktop() {
  // Readers don't wait for writers, and a write that finds the file busy waits instead of failing.
  await db.$queryRawUnsafe("PRAGMA journal_mode = WAL");
  await db.$queryRawUnsafe("PRAGMA busy_timeout = 10000");
  const dir = path.join(process.cwd(), "prisma", "sqlite", "migrations");
  const pending = await pendingMigrations(db, dir);
  // An update that changes the tables backs up first, so nothing is lost if it goes wrong.
  const fresh = !(await db.$queryRawUnsafe<unknown[]>(`SELECT 1 FROM "_viochem_migrations" LIMIT 1`)).length;
  if (pending.length && !fresh) await backupNow();
  const applied = await migrateSqlite(db, dir);
  if (applied.length) console.log(`Database updated: ${applied.join(", ")}`);
  scheduleBackups();
}
