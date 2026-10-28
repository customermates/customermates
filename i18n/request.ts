import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { errorReportingEnabled } from "@/core/errors/reporting-provider";

import { messagesForErrorReporting } from "./error-reporting-messages";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: messagesForErrorReporting((await import(`./locales/${locale}.json`)).default, errorReportingEnabled()),
  };
});
