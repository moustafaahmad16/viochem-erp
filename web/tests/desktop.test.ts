import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { isSqlite, sameName } from "@/lib/db";
import { statements } from "@/lib/desktop/migrate";

describe("the Windows app", () => {
  it("splits a migration into statements, leaving out comments", () => {
    const sql = `-- CreateTable\nCREATE TABLE "A" (\n  "id" INTEGER\n);\n\n-- Seed\nINSERT INTO "A" VALUES\n  (1),\n  (2);\n`;
    expect(statements(sql)).toEqual([`CREATE TABLE "A" (\n  "id" INTEGER\n)`, `INSERT INTO "A" VALUES\n  (1),\n  (2)`]);
  });

  it("matches names regardless of case", () => {
    expect(sameName("Givaudan SA", "GIVAUDAN sa")).toBe(true);
    expect(sameName("Givaudan", "Givaudan SA")).toBe(false);
  });

  describe.skipIf(!isSqlite())("on a SQLite file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "viochem-backups-"));
    process.env.VIOCHEM_DATA_DIR = dir;
    afterAll(() => {
      delete process.env.VIOCHEM_DATA_DIR;
      rmSync(dir, { recursive: true, force: true });
    });

    it("backs up a complete copy that opens on its own, keeping only the newest", async () => {
      const { writeConfig } = await import("@/lib/desktop/config");
      const { backupNow, listBackups } = await import("@/lib/desktop/backup");
      writeConfig({ backupDir: path.join(dir, "backups"), keepBackups: 1 });
      const b = await backupNow();
      const copy = new PrismaClient({ datasourceUrl: `file:${b.path}` });
      expect(await copy.ledgerAccount.count()).toBeGreaterThan(50);
      await copy.$disconnect();
      await backupNow();
      expect(listBackups()).toHaveLength(1);
      expect(readdirSync(path.join(dir, "backups"))).toHaveLength(1);
    });
  });
});
