import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";

/**
 * Brings a SQLite file up to date with the migrations in prisma/sqlite/migrations, each one once and
 * whole or not at all. The Windows app runs this on every start, so an update never loses data.
 * Returns the names of the migrations it applied.
 */
export async function migrateSqlite(db: PrismaClient, dir: string): Promise<string[]> {
  const applied: string[] = [];
  for (const entry of await pendingMigrations(db, dir)) {
    const sql = await readFile(path.join(dir, entry, "migration.sql"), "utf8");
    await db.$transaction([
      ...statements(sql).map((s) => db.$executeRawUnsafe(s)),
      db.$executeRawUnsafe(`INSERT INTO "_viochem_migrations" ("name", "appliedAt") VALUES (?, ?)`, entry, new Date().toISOString()),
    ]);
    applied.push(entry);
  }
  return applied;
}

/** Migrations not yet applied to this file, oldest first. */
export async function pendingMigrations(db: PrismaClient, dir: string): Promise<string[]> {
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "_viochem_migrations" ("name" TEXT PRIMARY KEY, "appliedAt" TEXT NOT NULL)`);
  const done = new Set((await db.$queryRawUnsafe<{ name: string }[]>(`SELECT "name" FROM "_viochem_migrations"`)).map((r) => r.name));
  const all = (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  return all.filter((name) => !done.has(name));
}

/** SQLite runs one statement at a time. Migrations end each statement with ";" at the end of a line. */
export function statements(sql: string): string[] {
  return sql
    .replace(/^\s*--.*$/gm, "")
    .split(/;\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
}
