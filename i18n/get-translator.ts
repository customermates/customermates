import { createTranslator } from "next-intl";

import type { ROUTING_LOCALES } from "./routing";

type Locale = (typeof ROUTING_LOCALES)[number];
type NamespaceArg = Parameters<typeof createTranslator>[0]["namespace"];

export async function getTranslator(locale: Locale, namespace?: NamespaceArg) {
  const messages = (await import(`./locales/${locale}.json`)).default;
  return createTranslator({ locale, namespace, messages });
}
