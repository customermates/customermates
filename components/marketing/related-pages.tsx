import type { ContentLocale } from "@/i18n/locale-registry";

import { getTranslations } from "next-intl/server";

import { HubPostCard, type HubPostCardProps } from "./hub-post-card";

export type RelatedPageItem = Omit<HubPostCardProps, "locale">;

type Props = {
  items: RelatedPageItem[];
  locale: ContentLocale;
};

export async function RelatedPages({ items, locale }: Props) {
  if (items.length === 0) return null;

  const t = await getTranslations();
  const heading = t("Common.relatedPages");

  return (
    <section className="pb-16 md:pb-24 w-full">
      <div className="max-w-7xl mx-auto px-4">
        <h2 className="text-x-3xl mb-8">{heading}</h2>

        <div className="grid auto-rows-fr grid-cols-1 gap-6 sm:grid-cols-2 md:gap-8 lg:grid-cols-3">
          {items.map((item) => (
            <div key={item.href} className="min-w-0">
              <HubPostCard {...item} locale={locale} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
