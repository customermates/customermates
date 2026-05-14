// Use this for translations in code that runs OUTSIDE the Next.js request context —
// trigger.dev workers, background scripts, tests. next-intl's getTranslations /
// useTranslations rely on createNextIntlPlugin in next.config.js, which the
// trigger.dev esbuild bundle doesn't include, so calling them from worker code
// throws "Couldn't find next-intl config file". Inside Next.js (server components,
// route handlers, server actions), keep using the native next-intl APIs.
import { createTranslator } from "next-intl";

import type { ROUTING_LOCALES } from "./routing";

type Locale = (typeof ROUTING_LOCALES)[number];
type NamespaceArg = Parameters<typeof createTranslator>[0]["namespace"];

export async function getTranslator(locale: Locale, namespace?: NamespaceArg) {
  const messages = (await import(`./locales/${locale}.json`)).default;
  return createTranslator({ locale, namespace, messages });
}
