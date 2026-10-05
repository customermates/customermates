import { appLocaleOrDefault, formattingTagFor } from "@/i18n/locale-registry";

export const RETRY_AFTER_LATER = "later";

export function formatRetryAfter(locale: unknown, seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return RETRY_AFTER_LATER;

  const rtf = new Intl.RelativeTimeFormat(formattingTagFor(appLocaleOrDefault(locale)), { numeric: "always" });
  if (seconds < 60) return rtf.format(Math.ceil(seconds), "second");
  if (seconds < 3600) return rtf.format(Math.ceil(seconds / 60), "minute");

  return rtf.format(Math.ceil(seconds / 3600), "hour");
}
