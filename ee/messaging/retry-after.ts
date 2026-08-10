import { appLocaleOrDefault, formattingTagFor } from "@/i18n/locale-registry";

export function formatRetryAfter(locale: unknown, seconds: number | null | undefined): string {
  const value = !seconds || seconds <= 0 ? 60 : seconds;

  const rtf = new Intl.RelativeTimeFormat(formattingTagFor(appLocaleOrDefault(locale)), { numeric: "always" });
  if (value < 60) return rtf.format(Math.ceil(value), "second");
  if (value < 3600) return rtf.format(Math.ceil(value / 60), "minute");

  return rtf.format(Math.ceil(value / 3600), "hour");
}
