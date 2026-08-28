import type { ReactNode } from "react";

import { getLocale, getTranslations } from "next-intl/server";

import {
  blogPostsSource,
  comparePagesSource,
  docsSource,
  featurePagesSource,
  forPagesSource,
} from "@/core/fumadocs/source";
import { compareDisplayTitle } from "@/core/seo/compare-title";
import { contentLocaleOrDefault } from "@/i18n/locale-registry";

import { HubPostCard } from "./hub-post-card";
import { type RelatedRouteSegment, type RelatedTargetResolver, resolveRelatedTarget } from "./related-target";

const RELATED_SEGMENTS: Record<RelatedRouteSegment, RelatedTargetResolver> = {
  blog: (slug, locale) => {
    const page = blogPostsSource.getPage([slug], locale);
    if (!page) return null;

    return {
      description: page.data.description,
      imageSrc: page.data.acquisition ? undefined : `${slug}.png`,
      title: page.data.title,
    };
  },
  compare: (slug, locale, alternativeTitle) => {
    const page = comparePagesSource.getPage([slug], locale);
    if (!page) return null;

    return {
      description: page.data.description,
      imageSrc: `${slug}.png`,
      title: compareDisplayTitle(
        slug,
        page.data.competitorName,
        page.data.comparison?.competitor2Name,
        alternativeTitle,
      ),
    };
  },
  docs: (slug, locale) => {
    const page = docsSource.getPage([slug], locale);
    if (!page) return null;

    return {
      description: page.data.description,
      title: page.data.title,
    };
  },
  features: (slug, locale) => {
    const page = featurePagesSource.getPage([slug], locale);
    if (!page) return null;

    return {
      description: page.data.description,
      imageSrc: page.data.acquisition ? undefined : `${slug}.png`,
      title: page.data.featureName,
    };
  },
  for: (slug, locale) => {
    const page = forPagesSource.getPage([slug], locale);
    if (!page) return null;

    return {
      description: page.data.description,
      imageSrc: page.data.acquisition ? undefined : `${slug}.png`,
      title: page.data.industryName,
    };
  },
};

export async function RelatedPages({ children }: { children: ReactNode }) {
  const t = await getTranslations();

  return (
    <section>
      <h2 className="text-x-2xl">{t("Common.relatedPages")}</h2>

      <div className="not-prose mt-6 grid auto-rows-fr grid-cols-1 gap-6 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export async function RelatedPage({ href }: { href: string }) {
  const [locale, t] = await Promise.all([getLocale(), getTranslations()]);
  const target = resolveRelatedTarget(
    href,
    locale,
    (competitor) => t("ComparePage.alternativeTitle", { competitor }),
    RELATED_SEGMENTS,
  );

  return (
    <div className="min-w-0">
      <HubPostCard {...target} href={href} locale={contentLocaleOrDefault(locale)} />
    </div>
  );
}
