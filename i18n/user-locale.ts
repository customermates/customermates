import type { Locale } from "@/generated/prisma";

import { ROUTING_DEFAULT_LOCALE } from "@/i18n/routing";

export function resolveUserLocale(user: { displayLanguage: Locale | null }): Exclude<Locale, "system"> {
  return !user.displayLanguage || user.displayLanguage === "system" ? ROUTING_DEFAULT_LOCALE : user.displayLanguage;
}
