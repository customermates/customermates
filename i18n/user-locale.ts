import type { Locale } from "@/generated/prisma";
import type { AppLocale, FormattingLocale } from "@/i18n/locale-registry";

import {
  APP_LOCALES,
  FORMATTING_LOCALES,
  appLocaleOrDefault,
  formattingTagFor,
  isAppLocale,
  isFormattingLocale,
} from "@/i18n/locale-registry";

export type StoredDisplayLanguage = AppLocale | "system";
export type StoredFormattingLocale = FormattingLocale | "system";

export const DISPLAY_LANGUAGE_VALUES = [...APP_LOCALES, "system"] as const;
export const FORMATTING_LOCALE_VALUES = [...FORMATTING_LOCALES, "system"] as const;

export function resolveUserLocale(user: { displayLanguage: Locale | null }): AppLocale {
  return appLocaleOrDefault(user.displayLanguage);
}

export function normalizeStoredDisplayLanguage(value: unknown): StoredDisplayLanguage {
  return value === "system" || isAppLocale(value) ? value : "system";
}

export function normalizeStoredFormattingLocale(value: unknown): StoredFormattingLocale {
  return value === "system" || isFormattingLocale(value) ? value : "system";
}

export function resolveUserFormattingTag(user: { formattingLocale: unknown }, displayLocale: AppLocale): string {
  const formattingLocale = normalizeStoredFormattingLocale(user.formattingLocale);
  if (formattingLocale === "system") return formattingTagFor(displayLocale);
  return formattingTagFor(formattingLocale);
}
