import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readConfig } from "./config";

/**
 * Off-site copies: each daily backup is also copied into a folder that Google Drive or OneDrive
 * keeps in sync, so a copy survives if this computer is lost, stolen or broken. The Drive or
 * OneDrive app does the uploading; VIOCHEM only needs to put the file in the folder.
 */

const PATTERN = /^viochem-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})\.db$/;

/** Folder name made inside the cloud folder. */
export const FOLDER_NAME = "VIOCHEM Backups";

/** No off-site copy for this long means something is wrong. */
export const STALE_AFTER_MS = 2 * 24 * 60 * 60 * 1000;

const when = (name: string) => {
  const m = PATTERN.exec(name);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) : null;
};

/**
 * Which backups to delete from the off-site folder: it keeps the newest backup of each of the last
 * `daily` days that have one, and the newest of each of the last `monthly` months.
 */
export function toPrune(names: string[], daily = 14, monthly = 12): string[] {
  const dated = names
    .map((name) => ({ name, at: when(name) }))
    .filter((b): b is { name: string; at: Date } => b.at !== null)
    .sort((a, b) => b.at.getTime() - a.at.getTime());
  const keep = new Set<string>();
  const days = new Set<string>();
  const months = new Set<string>();
  for (const b of dated) {
    const day = b.at.toDateString();
    const month = `${b.at.getFullYear()}-${b.at.getMonth()}`;
    if (!days.has(day) && days.size < daily) {
      days.add(day);
      keep.add(b.name);
    }
    if (!months.has(month) && months.size < monthly) {
      months.add(month);
      keep.add(b.name);
    }
  }
  return dated.filter((b) => !keep.has(b.name)).map((b) => b.name);
}

/** Google Drive and OneDrive folders on this computer, for the admin to pick from. */
export function cloudFolders(): { name: string; path: string }[] {
  const found: { name: string; path: string }[] = [];
  const add = (name: string, p: string | undefined) => {
    if (p && existsSync(p) && !found.some((f) => f.path.toLowerCase() === p.toLowerCase())) found.push({ name, path: p });
  };
  add("OneDrive", process.env.OneDriveCommercial);
  add("OneDrive", process.env.OneDriveConsumer);
  add("OneDrive", process.env.OneDrive);
  if (process.platform === "win32") {
    // Google Drive for desktop shows up as its own drive letter, G: unless that was taken.
    for (const letter of "GHIJKLMNOPQRSTUVWXYZDEF") {
      add("Google Drive", `${letter}:\\My Drive`);
    }
  }
  if (process.env.USERPROFILE) add("Google Drive", path.join(process.env.USERPROFILE, "Google Drive"));
  return found.map((f) => ({ ...f, path: path.join(f.path, FOLDER_NAME) }));
}

type State = { lastCopyAt?: string; lastFile?: string; lastError?: string; lastErrorAt?: string };
const stateFile = () => path.join(process.env.VIOCHEM_DATA_DIR ?? "", "offsite.json");

function readState(): State {
  try {
    return JSON.parse(readFileSync(stateFile(), "utf8"));
  } catch {
    return {};
  }
}

function writeState(s: State) {
  writeFileSync(`${stateFile()}.tmp`, JSON.stringify(s, null, 2));
  renameSync(`${stateFile()}.tmp`, stateFile());
}

/** The folder must already exist one level up: if Google Drive or OneDrive is signed out, its folder is gone and that is an error, not something to recreate on this computer's own disk. */
function ensureFolder(dir: string) {
  if (existsSync(dir)) return;
  if (!existsSync(path.dirname(dir))) throw new Error(`The folder ${path.dirname(dir)} can't be found. Check that Google Drive or OneDrive is running and signed in.`);
  mkdirSync(dir);
}

/**
 * Copies a backup file into the off-site folder and removes the copies no longer kept.
 * It is copied under a temporary name first, so the cloud app never uploads half a file.
 */
export function copyOffsite(file: string, now = new Date()) {
  const dir = readConfig().offsiteDir;
  if (!dir) return null;
  try {
    ensureFolder(dir);
    const target = path.join(dir, path.basename(file));
    const partial = `${target}.partial`;
    copyFileSync(file, partial);
    if (statSync(partial).size !== statSync(file).size) throw new Error("The copy came out a different size from the backup.");
    renameSync(partial, target);
    for (const old of toPrune(readdirSync(dir))) rmSync(path.join(dir, old), { force: true });
    writeState({ lastCopyAt: now.toISOString(), lastFile: path.basename(file) });
    return target;
  } catch (e) {
    // Our own messages are kept; a disk error (full, no permission) is summed up with its code.
    const err = e as NodeJS.ErrnoException;
    const message = err.code ? `Couldn't copy the backup into ${dir} (${err.code}).` : err.message;
    writeState({ ...readState(), lastError: message, lastErrorAt: now.toISOString() });
    throw new Error(message);
  }
}

export type OffsiteStatus =
  | { state: "off" }
  | { state: "ok" | "stale"; dir: string; lastCopyAt: Date | null; lastFile: string | null; error: string | null };

/** Whether off-site copies are on, when the last one was made, and whether that is too long ago. */
export function offsiteStatus(now = new Date()): OffsiteStatus {
  const dir = readConfig().offsiteDir;
  if (!dir) return { state: "off" };
  const s = readState();
  const lastCopyAt = s.lastCopyAt ? new Date(s.lastCopyAt) : null;
  // An error after the last good copy is still current.
  const error = s.lastError && (!lastCopyAt || new Date(s.lastErrorAt ?? 0) > lastCopyAt) ? s.lastError : null;
  const stale = !lastCopyAt || now.getTime() - lastCopyAt.getTime() > STALE_AFTER_MS;
  return { state: stale ? "stale" : "ok", dir, lastCopyAt, lastFile: s.lastFile ?? null, error };
}

/** True when the newest off-site copy is less than a day old. */
export function offsiteDoneToday(now = new Date()) {
  const s = offsiteStatus(now);
  return s.state !== "off" && s.lastCopyAt !== null && !s.error && now.getTime() - s.lastCopyAt.getTime() < 23 * 60 * 60 * 1000;
}
