import { z } from "zod";

import { KEYBOARD_P13N_ID, KeyboardPreferencesSchema } from "./keyboard-preferences.schema";
import { SIDEBAR_P13N_ID, SidebarLayoutSchema } from "./sidebar-layout.schema";

export const P13N_SETTINGS_SCHEMAS = {
  [SIDEBAR_P13N_ID]: SidebarLayoutSchema,
  [KEYBOARD_P13N_ID]: KeyboardPreferencesSchema,
} as const;

export type P13nSettingsId = keyof typeof P13N_SETTINGS_SCHEMAS;

export type P13nSettingsOf<Id extends P13nSettingsId> = z.infer<(typeof P13N_SETTINGS_SCHEMAS)[Id]>;

export const P13nSettingsSchema = z.union([SidebarLayoutSchema, KeyboardPreferencesSchema]);

export type P13nSettings = z.infer<typeof P13nSettingsSchema>;

export function p13nSettingsSchema(p13nId: string) {
  return Object.hasOwn(P13N_SETTINGS_SCHEMAS, p13nId) ? P13N_SETTINGS_SCHEMAS[p13nId as P13nSettingsId] : null;
}

export function readP13nSettings<Id extends P13nSettingsId>(p13nId: Id, value: unknown): P13nSettingsOf<Id> | null {
  const parsed = P13N_SETTINGS_SCHEMAS[p13nId].safeParse(value);
  return parsed.success ? (parsed.data as P13nSettingsOf<Id>) : null;
}
