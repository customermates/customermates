// This config is wired up by createNextIntlPlugin in next.config.js and only
// applies inside the Next.js request context. It is NOT loaded by the trigger.dev
// worker bundle. Worker / background code needing translations must use
// getTranslator from ./get-translator.ts instead.
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`./locales/${locale}.json`)).default,
  };
});
