import { isMarketingLocale, isMarketingPathPublished, stripLocalePrefix } from "@/i18n/locale-registry";

type SlugSource = {
  getPages: (locale: string) => readonly { slugs: string[]; url: string }[];
};

export function localizedSlugParams<const Key extends string>(
  source: SlugSource,
  locale: string,
  key: Key,
): Record<Key, string>[] {
  if (!isMarketingLocale(locale)) return [];

  return source
    .getPages(locale)
    .filter((page) => page.slugs.length === 1 && isMarketingPathPublished(locale, stripLocalePrefix(page.url)))
    .map((page) => ({ [key]: page.slugs[0] }) as Record<Key, string>);
}
