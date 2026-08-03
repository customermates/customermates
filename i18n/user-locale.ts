import type { Locale } from "@/generated/prisma";
import type { AppLocale } from "@/i18n/locale-registry";

import { appLocaleOrDefault } from "@/i18n/locale-registry";

export function resolveUserLocale(user: { displayLanguage: Locale | null }): AppLocale {
  return appLocaleOrDefault(user.displayLanguage);
}
