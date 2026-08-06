export function terminologyLabelForSentence(label: string, locale: string): string {
  return locale === "de" ? label : label.toLocaleLowerCase(locale);
}
