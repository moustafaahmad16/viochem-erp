import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { UserError } from "./errors";

/** Checks a new password, and that it was typed the same twice. */
export function checkNewPassword(password: string, confirm: string) {
  if (password.length < 8) throw new UserError("Password must be at least 8 characters.");
  if (password !== confirm) throw new UserError("The two passwords aren't the same.");
}

/** A user changes their own password, knowing the old one. */
export async function changeOwnPassword(userId: number, current: string, password: string, confirm: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await bcrypt.compare(current, user.passwordHash))) throw new UserError("Your current password isn't right.");
  checkNewPassword(password, confirm);
  await db.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(password, 10) } });
}

/** Gives a user a new password, for when they forgot theirs. `turnOn` also lets a turned-off user sign in again. */
export async function setPassword(userId: number, password: string, confirm = password, { turnOn = false } = {}) {
  checkNewPassword(password, confirm);
  await db.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(password, 10), ...(turnOn ? { active: true } : {}) } });
}

// For when nobody can sign in as an admin. The Windows app's File menu, on the computer it runs on,
// writes a one-time key to its data folder and opens the reset page with it. The key never leaves
// that computer, so the page can't be used from a phone or another computer on the Wi-Fi.

const RESET_MINUTES = 15;
const resetFile = (dataDir: string) => path.join(dataDir, "password-reset.json");

/** Made by the Windows app's menu. Exported for the tests; the app writes the same file itself. */
export function startAdminReset(dataDir: string, now = new Date()) {
  const key = randomBytes(24).toString("hex");
  writeFileSync(resetFile(dataDir), JSON.stringify({ key, expires: new Date(now.getTime() + RESET_MINUTES * 60_000).toISOString() }));
  return key;
}

/** True when this is the key the app's menu made, and it hasn't run out. */
export function resetKeyIsValid(dataDir: string | undefined, key: string | null | undefined, now = new Date()) {
  if (!dataDir || !key) return false;
  try {
    const saved = JSON.parse(readFileSync(resetFile(dataDir), "utf8")) as { key: string; expires: string };
    const a = Buffer.from(String(saved.key));
    const b = Buffer.from(key);
    return a.length === b.length && timingSafeEqual(a, b) && new Date(saved.expires) > now;
  } catch {
    return false;
  }
}

/** Sets an admin's new password with the app's key, which then can't be used again. */
export async function resetAdminPassword(dataDir: string | undefined, key: string, userId: number, password: string, confirm: string) {
  if (!resetKeyIsValid(dataDir, key)) throw new UserError("This reset link has run out. Open it again from the File menu of VIOCHEM on the main computer.");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== "ADMIN") throw new UserError("Choose an admin.");
  // Turned on too: an admin who was turned off would otherwise still be locked out.
  await setPassword(userId, password, confirm, { turnOn: true });
  rmSync(resetFile(dataDir!), { force: true });
  return user;
}
