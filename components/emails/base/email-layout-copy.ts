import enMessages from "@/i18n/locales/en.json";

import { getTranslator } from "@/i18n/get-translator";
import { DEFAULT_LOCALE, formattingTagFor, type AppLocale } from "@/i18n/locale-registry";

export type EmailLayoutCopy = {
  country: string;
  tagline: string;
};

function countryName(locale: AppLocale): string {
  return new Intl.DisplayNames([formattingTagFor(locale)], { type: "region" }).of("DE") ?? "DE";
}

export const DEFAULT_EMAIL_LAYOUT_COPY: EmailLayoutCopy = {
  country: countryName(DEFAULT_LOCALE),
  tagline: enMessages.EmailLayout.tagline,
};

export async function getEmailLayoutCopy(locale: AppLocale): Promise<EmailLayoutCopy> {
  const t = await getTranslator(locale, "EmailLayout");
  return { country: countryName(locale), tagline: t("tagline") };
}
