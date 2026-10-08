"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/components/forms";
import { signIn, signOut } from "@/lib/auth";

export async function login(_: FormState, fd: FormData): Promise<FormState> {
  const ok = await signIn(String(fd.get("email") ?? ""), String(fd.get("password") ?? ""));
  if (!ok) return { error: "Wrong email or password." };
  redirect("/");
}

export async function logout() {
  await signOut();
  redirect("/login");
}
