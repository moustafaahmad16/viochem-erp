import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { LANG_COOKIE, translator, type Lang } from "./core";

export const getLang = cache(async (): Promise<Lang> => ((await cookies()).get(LANG_COOKIE)?.value === "ar" ? "ar" : "en"));

/** The translator for this request, in the language the person chose. */
export const getT = cache(async () => translator(await getLang()));
