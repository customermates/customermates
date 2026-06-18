// Standalone translator for an explicitly given locale, built on next-intl's
// createTranslator. Use it when the target locale is not the current request's,
// e.g. rendering emails in each recipient's locale.
import { createTranslator } from "next-intl";

import type { ROUTING_LOCALES } from "./routing";

type Locale = (typeof ROUTING_LOCALES)[number];
type NamespaceArg = Parameters<typeof createTranslator>[0]["namespace"];

export async function getTranslator(locale: Locale, namespace?: NamespaceArg) {
  const messages = (await import(`./locales/${locale}.json`)).default;
  return createTranslator({ locale, namespace, messages });
}
