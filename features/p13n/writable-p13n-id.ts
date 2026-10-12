import { z } from "zod";

import { CONFIGURE_GRAPH_P13N_ID } from "./p13n-settings.schema";
import { KEYBOARD_P13N_ID } from "./keyboard-preferences.schema";
import { SIDEBAR_P13N_ID } from "./sidebar-layout.schema";

export const P13N_ID_MAX_LENGTH = 120;

const WRITABLE_P13N_IDS = new Set<string>([SIDEBAR_P13N_ID, CONFIGURE_GRAPH_P13N_ID, KEYBOARD_P13N_ID, "wiki-layout"]);
const WRITABLE_P13N_PREFIXES = ["record-panels:", "sublist-columns:"] as const;

export function isWritableP13nId(p13nId: string): boolean {
  if (WRITABLE_P13N_IDS.has(p13nId)) return true;
  return WRITABLE_P13N_PREFIXES.some(
    (prefix) => p13nId.startsWith(prefix) && z.uuid().safeParse(p13nId.slice(prefix.length)).success,
  );
}
