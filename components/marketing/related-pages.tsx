import type { ContentLocale } from "@/i18n/locale-registry";

import { getLocale, getTranslations } from "next-intl/server";

import { comparePagesSource, featurePagesSource, forPagesSource } from "@/core/fumadocs/source";
import { contentLocaleOrDefault } from "@/i18n/locale-registry";
import { compareDisplayTitle } from "@/core/seo/compare-title";
import { planRelatedLinks } from "@/core/seo/related-selection";

import { HubPostCard, type HubPostCardProps } from "./hub-post-card";

export type RelatedPageItem = Omit<HubPostCardProps, "locale">;

type RelatedCandidate = {
  description: string;
  related: readonly string[];
  title: string;
  url?: string;
};

export type RelatedCollection = "compare-pages" | "feature-pages" | "for-pages";

type AlternativeTitle = (competitor: string) => string;

const RELATED_COLLECTIONS: Record<
  RelatedCollection,
  { hrefBase: string; pages: (locale: string, alternativeTitle: AlternativeTitle) => RelatedCandidate[] }
> = {
  "compare-pages": {
    hrefBase: "/compare",
    pages: (locale, alternativeTitle) =>
      comparePagesSource.getPages(locale).map((page) => ({
        description: page.data.description,
        related: page.data.related,
        title: compareDisplayTitle(
          page.url?.split("/").pop() ?? "",
          page.data.competitorName,
          page.data.comparison?.competitor2Name,
          alternativeTitle,
        ),
        url: page.url,
      })),
  },
  "feature-pages": {
    hrefBase: "/features",
    pages: (locale) =>
      featurePagesSource.getPages(locale).map((page) => ({
        description: page.data.description,
        related: page.data.related,
        title: page.data.featureName,
        url: page.url,
      })),
  },
  "for-pages": {
    hrefBase: "/for",
    pages: (locale) =>
      forPagesSource.getPages(locale).map((page) => ({
        description: page.data.description,
        related: page.data.related,
        title: page.data.industryName,
        url: page.url,
      })),
  },
};

export function relatedPageItems(
  collection: RelatedCollection,
  slug: string,
  locale: string,
  alternativeTitle: AlternativeTitle,
): RelatedPageItem[] {
  const config = RELATED_COLLECTIONS[collection];
  const candidates = config
    .pages(locale, alternativeTitle)
    .map((candidate) => ({ ...candidate, slug: candidate.url?.split("/").pop() ?? "" }))
    .filter((candidate) => candidate.slug.length > 0);
  const bySlug = new Map(candidates.map((candidate) => [candidate.slug, candidate]));
  const plan = planRelatedLinks(
    candidates.map(({ related, slug: entrySlug }) => ({ curated: related, slug: entrySlug })),
  );

  return (plan.get(slug) ?? []).flatMap((related) => {
    const target = bySlug.get(related);
    if (!target) return [];

    return [
      {
        description: target.description,
        href: `${config.hrefBase}/${related}`,
        imageSrc: `${related}.png`,
        title: target.title,
      },
    ];
  });
}

export function relatedPagesSlot(collection: RelatedCollection, slug: string) {
  return async function RelatedPagesSlot() {
    const locale = await getLocale();
    const t = await getTranslations();
    const items = relatedPageItems(collection, slug, locale, (competitor) =>
      t("ComparePage.alternativeTitle", { competitor }),
    );

    return <RelatedPages items={items} locale={contentLocaleOrDefault(locale)} />;
  };
}

type Props = {
  items: RelatedPageItem[];
  locale: ContentLocale;
};

export async function RelatedPages({ items, locale }: Props) {
  if (items.length === 0) return null;

  const t = await getTranslations();

  return (
    <section>
      <h2 className="text-x-2xl">{t("Common.relatedPages")}</h2>

      <div className="not-prose mt-6 grid auto-rows-fr grid-cols-1 gap-6 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.href} className="min-w-0">
            <HubPostCard {...item} locale={locale} />
          </div>
        ))}
      </div>
    </section>
  );
}
