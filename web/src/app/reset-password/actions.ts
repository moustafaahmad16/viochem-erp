"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/components/forms";
import { fail } from "@/lib/actions";
import { signIn } from "@/lib/auth";
import { resetAdminPassword } from "@/lib/services/passwords";

/** Sets a new password for an admin, with the one-time key from the Windows app's File menu, and signs them in. */
export async function resetAdmin(key: string, _: FormState, fd: FormData): Promise<FormState> {
  try {
    const password = String(fd.get("password") ?? "");
    const user = await resetAdminPassword(process.env.VIOCHEM_DATA_DIR, key, Number(fd.get("user")), password, String(fd.get("confirm") ?? ""));
    await signIn(user.email, password);
  } catch (e) {
    return fail(e);
  }
  redirect("/");
}
