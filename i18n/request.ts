import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { env } from "@/env";

import { messagesForErrorReporting } from "./error-reporting-messages";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: messagesForErrorReporting(
      (await import(`./locales/${locale}.json`)).default,
      Boolean(env.NEXT_PUBLIC_SENTRY_DSN),
    ),
  };
});
