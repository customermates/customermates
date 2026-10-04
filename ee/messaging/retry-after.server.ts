import { getLocale, getTranslations } from "next-intl/server";

import { RETRY_AFTER_LATER, formatRetryAfter } from "./retry-after";

export async function retryAfterPhrase(seconds: number | null | undefined): Promise<string> {
  const phrase = formatRetryAfter(await getLocale(), seconds);
  if (phrase !== RETRY_AFTER_LATER) return phrase;

  const t = await getTranslations("Common");
  return t("retryLater");
}
