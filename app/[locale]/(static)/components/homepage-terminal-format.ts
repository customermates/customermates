import type { ContentLocale } from "@/i18n/locale-registry";

import { formattingTagFor } from "@/i18n/locale-registry";

export function homepageTerminalFormatters(locale: ContentLocale) {
  const formattingTag = formattingTagFor(locale);

  return {
    currency: new Intl.NumberFormat(formattingTag, {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }),
    days: new Intl.NumberFormat(formattingTag, { style: "unit", unit: "day", unitDisplay: "narrow" }),
  };
}
