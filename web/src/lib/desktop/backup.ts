import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { backupDir, readConfig } from "./config";
import { copyOffsite, offsiteDoneToday } from "./offsite";

export type Backup = { name: string; path: string; at: Date; size: number };

const PATTERN = /^viochem-\d{4}-\d{2}-\d{2}-\d{4}\.db$/;

/** Backups in the backup folder, newest first. */
export function listBackups(): Backup[] {
  const dir = backupDir();
  let names: string[] = [];
  try {
    names = readdirSync(dir).filter((n) => PATTERN.test(n));
  } catch {
    return [];
  }
  return names
    .map((name) => {
      const s = statSync(path.join(dir, name));
      return { name, path: path.join(dir, name), at: s.mtime, size: s.size };
    })
    .sort((a, b) => b.at.getTime() - a.at.getTime());
}

/**
 * A complete copy of the database as it is right now, safe to take while people are working.
 * Keeps the newest backups and deletes the rest.
 */
export async function backupNow(): Promise<Backup> {
  const dir = backupDir();
  mkdirSync(dir, { recursive: true });
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const name = `viochem-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.db`;
  const target = path.join(dir, name);
  rmSync(target, { force: true });
  await db.$executeRawUnsafe(`VACUUM INTO ?`, target);
  for (const old of listBackups().slice(Math.max(1, readConfig().keepBackups))) rmSync(old.path, { force: true });
  return listBackups().find((b) => b.name === name)!;
}

/**
 * Backs up once a day while the app is open: at start if the last backup is a day old, then every hour checks again.
 * The newest backup is then copied off-site, if that is set up and not yet done today; a failed copy is tried again each hour.
 */
export function scheduleBackups() {
  const due = async () => {
    const last = listBackups()[0];
    if (!last || Date.now() - last.at.getTime() >= 23 * 60 * 60 * 1000) {
      try {
        const b = await backupNow();
        console.log(`Backed up to ${b.path}`);
      } catch (e) {
        console.error("Backup failed", e);
        return;
      }
    }
    const newest = listBackups()[0];
    if (newest && readConfig().offsiteDir && !offsiteDoneToday()) {
      try {
        console.log(`Copied off-site to ${copyOffsite(newest.path)}`);
      } catch (e) {
        console.error("Off-site copy failed", e);
      }
    }
  };
  void due();
  setInterval(due, 60 * 60 * 1000).unref();
}
