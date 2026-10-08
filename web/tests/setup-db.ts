import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

// Integration tests use their own database (viochem_test). It is brought up to date,
// then emptied, before every run.
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://viochem:viochem@localhost:5432/viochem_test";
  if (!/_test(\?|$)/.test(url)) throw new Error("Tests only run against a database whose name ends in _test");
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" });

  const db = new PrismaClient({ datasourceUrl: url });
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await db.$disconnect();
}
