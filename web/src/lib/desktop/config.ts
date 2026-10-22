import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import path from "node:path";

/**
 * The Windows app. It starts this server with VIOCHEM_DATA_DIR set to its data folder, which holds
 * the database (viochem.db) and desktop.json: settings that live in environment variables on the
 * website, and that an admin changes from the app instead.
 */
export const isDesktop = () => Boolean(process.env.VIOCHEM_DATA_DIR);

export type DesktopConfig = {
  /** Where daily backups go. Empty means the app's default, Documents\VIOCHEM Backups. */
  backupDir: string;
  /** How many backups to keep; the oldest go first. */
  keepBackups: number;
  eta: { environment: "preprod" | "production"; clientId: string; clientSecret: string };
};

const DEFAULTS: DesktopConfig = { backupDir: "", keepBackups: 30, eta: { environment: "preprod", clientId: "", clientSecret: "" } };

const file = () => path.join(process.env.VIOCHEM_DATA_DIR ?? "", "desktop.json");

export function readConfig(): DesktopConfig {
  let saved: Partial<DesktopConfig> = {};
  try {
    saved = JSON.parse(readFileSync(file(), "utf8"));
  } catch {
    // First start, or no settings saved yet.
  }
  return { ...DEFAULTS, ...saved, eta: { ...DEFAULTS.eta, ...saved.eta } };
}

export function writeConfig(change: Partial<DesktopConfig>) {
  const next = { ...readConfig(), ...change };
  mkdirSync(path.dirname(file()), { recursive: true });
  // Written beside it, then swapped in, so a crash never leaves half a file.
  writeFileSync(`${file()}.tmp`, JSON.stringify(next, null, 2));
  renameSync(`${file()}.tmp`, file());
  return next;
}

export function backupDir() {
  return readConfig().backupDir || process.env.VIOCHEM_BACKUP_DIR || path.join(process.env.VIOCHEM_DATA_DIR ?? "", "backups");
}

/** The port this server listens on. */
export const port = () => Number(process.env.PORT ?? 3000);

/** Addresses other computers and phones on the same network open the app at. */
export function networkAddresses(): string[] {
  const urls = ["http://viochem.local:" + port()];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === "IPv4" && !a.internal && !a.address.startsWith("169.254.")) urls.push(`http://${a.address}:${port()}`);
    }
  }
  return urls;
}
