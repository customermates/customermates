import { z } from "zod";

export const KEYBOARD_P13N_ID = "keyboard";

export const KeyboardPreferencesSchema = z.object({ singleKeyShortcuts: z.boolean() }).strict();

export type KeyboardPreferences = z.infer<typeof KeyboardPreferencesSchema>;

export const DEFAULT_KEYBOARD_PREFERENCES: KeyboardPreferences = {
  singleKeyShortcuts: true,
};
