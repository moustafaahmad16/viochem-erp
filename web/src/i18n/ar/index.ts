import { alerts } from "./alerts";
import { cheques } from "./cheques";
import { common } from "./common";
import { credits } from "./credits";
import { imports } from "./imports";
import { money } from "./money";
import { orders } from "./orders";
import { quotes } from "./quotes";
import { sales } from "./sales";

/** Arabic for each English text, gathered by area of the app. */
export const ar: Record<string, string> = { ...common, ...sales, ...imports, ...money, ...quotes, ...credits, ...cheques, ...orders, ...alerts };
