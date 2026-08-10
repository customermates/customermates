import { appLocaleOrDefault, formattingTagFor, lowercaseEntityLabelsInSentences } from "@/i18n/locale-registry";

export function terminologyLabelForSentence(label: string, locale: unknown): string {
  const appLocale = appLocaleOrDefault(locale);
  if (!lowercaseEntityLabelsInSentences(appLocale)) return label;
  return label.toLocaleLowerCase(formattingTagFor(appLocale));
}
