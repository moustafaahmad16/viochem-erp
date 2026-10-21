import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { migrateSqlite } from "@/lib/desktop/migrate";

// Integration tests use their own database (viochem_test). It is brought up to date,
// then emptied, before every run. The chart of accounts the migrations seed is kept.
// TEST_DATABASE_URL=file:./viochem_test.db runs them against SQLite, the way the Windows app stores data.
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://viochem:viochem@localhost:5432/viochem_test";
  if (!/_test(\.db)?(\?|$)/.test(url)) throw new Error("Tests only run against a database whose name ends in _test");

  if (url.startsWith("file:")) {
    // Prisma reads a relative file path from the schema's folder.
    const file = path.resolve("prisma/sqlite", url.slice("file:".length).split("?")[0]);
    for (const suffix of ["", "-wal", "-shm", "-journal"]) rmSync(file + suffix, { force: true });
    const db = new PrismaClient({ datasourceUrl: url });
    await migrateSqlite(db, path.resolve("prisma/sqlite/migrations"));
    await db.$disconnect();
    return;
  }

  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" });

  const db = new PrismaClient({ datasourceUrl: url });
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', 'LedgerAccount')`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await db.$disconnect();
}
