import { common } from "./common";
import { imports } from "./imports";
import { money } from "./money";
import { sales } from "./sales";

/** Arabic for each English text, gathered by area of the app. */
export const ar: Record<string, string> = { ...common, ...sales, ...imports, ...money };
