import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { toPrune } from "@/lib/desktop/offsite";

const name = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `viochem-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.db`;
};

describe("off-site backups", () => {
  it("keeps the last 14 days and one a month for a year", () => {
    // A backup at 09:00 every day for two years, ending 31 Oct 2026.
    const names: string[] = [];
    for (let i = 0; i < 730; i++) names.push(name(new Date(2026, 9, 31 - i, 9, 0)));
    const gone = new Set(toPrune(names));
    const kept = names.filter((n) => !gone.has(n));
    // 14 days (18–31 Oct) plus the newest of each of the 11 months before October.
    expect(kept).toHaveLength(25);
    expect(kept).toContain("viochem-2026-10-18-0900.db");
    expect(kept).not.toContain("viochem-2026-10-17-0900.db");
    expect(kept).toContain("viochem-2026-09-30-0900.db");
    expect(kept).toContain("viochem-2025-11-30-0900.db");
    expect(kept).not.toContain("viochem-2025-10-31-0900.db");
  });

  it("keeps only the newest backup of a day, and never touches other files", () => {
    const names = ["viochem-2026-10-31-0900.db", "viochem-2026-10-31-1500.db", "notes.txt", "viochem-2026-10-30-0900.db.partial"];
    expect(toPrune(names)).toEqual(["viochem-2026-10-31-0900.db"]);
  });

  describe("copying", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "viochem-offsite-"));
    process.env.VIOCHEM_DATA_DIR = dir;
    afterAll(() => {
      delete process.env.VIOCHEM_DATA_DIR;
      rmSync(dir, { recursive: true, force: true });
    });
    const backup = path.join(dir, "viochem-2026-10-31-0900.db");
    writeFileSync(backup, "data");

    it("copies into the cloud folder and reports when", async () => {
      const { writeConfig } = await import("@/lib/desktop/config");
      const { copyOffsite, offsiteStatus } = await import("@/lib/desktop/offsite");
      const drive = path.join(dir, "My Drive");
      mkdirSync(drive);
      writeConfig({ offsiteDir: path.join(drive, "VIOCHEM Backups") });
      const at = new Date(2026, 9, 31, 9, 5);
      copyOffsite(backup, at);
      expect(readdirSync(path.join(drive, "VIOCHEM Backups"))).toEqual(["viochem-2026-10-31-0900.db"]);
      expect(offsiteStatus(new Date(2026, 9, 31, 12))).toMatchObject({ state: "ok", lastCopyAt: at, error: null });
      // Two days without a copy is an alert.
      expect(offsiteStatus(new Date(2026, 10, 2, 10)).state).toBe("stale");
    });

    it("fails, without making the folder on this computer, when the drive is signed out", async () => {
      const { writeConfig } = await import("@/lib/desktop/config");
      const { copyOffsite, offsiteStatus } = await import("@/lib/desktop/offsite");
      writeConfig({ offsiteDir: path.join(dir, "G-drive-gone", "VIOCHEM Backups") });
      expect(() => copyOffsite(backup, new Date(2026, 10, 1, 9))).toThrow(/can't be found/);
      expect(readdirSync(dir)).not.toContain("G-drive-gone");
      const s = offsiteStatus(new Date(2026, 10, 1, 10));
      expect(s.state === "ok" || s.state === "stale" ? s.error : null).toMatch(/can't be found/);
    });
  });
});
