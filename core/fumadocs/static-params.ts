import { isContentLocale } from "@/i18n/locale-registry";

type SlugSource = {
  getPages: (locale: string) => readonly { slugs: string[] }[];
};

export function localizedSlugParams<const Key extends string>(
  source: SlugSource,
  locale: string,
  key: Key,
): Record<Key, string>[] {
  if (!isContentLocale(locale)) return [];

  return source
    .getPages(locale)
    .filter((page) => page.slugs.length === 1)
    .map((page) => ({ [key]: page.slugs[0] }) as Record<Key, string>);
}
