"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LANG_COOKIE } from "./core";

export async function setLang(lang: string) {
  (await cookies()).set(LANG_COOKIE, lang === "ar" ? "ar" : "en", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}
