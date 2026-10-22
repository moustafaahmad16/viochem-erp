"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/components/forms";
import { fail, required } from "@/lib/actions";
import { hashPassword, signIn, signOut } from "@/lib/auth";
import { db } from "@/lib/db";
import { isDesktop } from "@/lib/desktop/config";
import { UserError } from "@/lib/services/errors";

export async function login(_: FormState, fd: FormData): Promise<FormState> {
  const ok = await signIn(String(fd.get("email") ?? ""), String(fd.get("password") ?? ""));
  if (!ok) return { error: "Wrong email or password." };
  redirect("/");
}

/** The Windows app's first start: whoever installs it becomes the first admin. Only while there are no users. */
export async function setup(_: FormState, fd: FormData): Promise<FormState> {
  try {
    if (!isDesktop() || (await db.user.count())) throw new UserError("Sign in instead. This computer already has users.");
    const email = required(fd, "email", "Email").toLowerCase();
    const password = required(fd, "password", "Password");
    if (password.length < 8) throw new UserError("Password must be at least 8 characters.");
    if (password !== fd.get("confirm")) throw new UserError("The two passwords aren't the same.");
    await db.user.create({ data: { name: required(fd, "name", "Name"), email, role: "ADMIN", passwordHash: await hashPassword(password) } });
    await signIn(email, password);
  } catch (e) {
    return fail(e);
  }
  redirect("/");
}

export async function logout() {
  await signOut();
  redirect("/login");
}
