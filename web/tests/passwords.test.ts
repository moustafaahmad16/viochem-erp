import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { changeOwnPassword, resetAdminPassword, resetKeyIsValid, setPassword, startAdminReset } from "@/lib/services/passwords";

const dataDir = mkdtempSync(path.join(tmpdir(), "viochem-reset-"));
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

const user = async (email: string, role: "ADMIN" | "STAFF" = "STAFF", password = "old-password") =>
  db.user.create({ data: { email, name: email, role, passwordHash: await bcrypt.hash(password, 4) } });
const passwordOf = async (id: number, password: string) => bcrypt.compare(password, (await db.user.findUniqueOrThrow({ where: { id } })).passwordHash);

describe("passwords", () => {
  it("lets a user change their own password only with the current one", async () => {
    const u = await user("pw-own@test");
    await expect(changeOwnPassword(u.id, "wrong", "new-password", "new-password")).rejects.toThrow("current password isn't right");
    await expect(changeOwnPassword(u.id, "old-password", "new-password", "different")).rejects.toThrow("aren't the same");
    await expect(changeOwnPassword(u.id, "old-password", "short", "short")).rejects.toThrow("at least 8");
    await changeOwnPassword(u.id, "old-password", "new-password", "new-password");
    expect(await passwordOf(u.id, "new-password")).toBe(true);
  });

  it("lets an admin set a new password without turning the user back on", async () => {
    const u = await user("pw-reset@test");
    await db.user.update({ where: { id: u.id }, data: { active: false } });
    await setPassword(u.id, "given-password");
    expect(await passwordOf(u.id, "given-password")).toBe(true);
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).active).toBe(false);
  });

  it("resets an admin's password with the main computer's one-time key", async () => {
    const admin = await user("pw-admin@test", "ADMIN");
    const staff = await user("pw-staff@test");
    await db.user.update({ where: { id: admin.id }, data: { active: false } });

    expect(resetKeyIsValid(dataDir, "anything")).toBe(false);
    const key = startAdminReset(dataDir);
    expect(resetKeyIsValid(dataDir, key)).toBe(true);
    expect(resetKeyIsValid(dataDir, key.replace(/.$/, (c) => (c === "0" ? "1" : "0")))).toBe(false);
    expect(resetKeyIsValid(undefined, key)).toBe(false);
    expect(resetKeyIsValid(dataDir, key, new Date(Date.now() + 16 * 60_000))).toBe(false);

    await expect(resetAdminPassword(dataDir, key, staff.id, "new-password", "new-password")).rejects.toThrow("Choose an admin");
    await expect(resetAdminPassword(dataDir, "wrong", admin.id, "new-password", "new-password")).rejects.toThrow("run out");
    await resetAdminPassword(dataDir, key, admin.id, "new-password", "new-password");
    expect(await passwordOf(admin.id, "new-password")).toBe(true);
    expect((await db.user.findUniqueOrThrow({ where: { id: admin.id } })).active).toBe(true);

    // Used once, the key is gone.
    expect(existsSync(path.join(dataDir, "password-reset.json"))).toBe(false);
    await expect(resetAdminPassword(dataDir, key, admin.id, "again-password", "again-password")).rejects.toThrow("run out");
  });
});
