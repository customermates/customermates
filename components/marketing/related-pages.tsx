import type { ReactNode } from "react";

import { getLocale, getTranslations } from "next-intl/server";

import { comparePagesSource, featurePagesSource, forPagesSource } from "@/core/fumadocs/source";
import { compareDisplayTitle } from "@/core/seo/compare-title";
import { contentLocaleOrDefault } from "@/i18n/locale-registry";

import { HubPostCard } from "./hub-post-card";

type ResolvedTarget = { description: string; imageSrc?: string; title: string };

type Resolver = (
  slug: string,
  locale: string,
  alternativeTitle: (competitor: string) => string,
) => ResolvedTarget | null;

const RELATED_SEGMENTS: Record<string, Resolver> = {
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
  const locale = await getLocale();
  const t = await getTranslations();
  const [, segment, slug] = href.split("/");
  const resolve = RELATED_SEGMENTS[segment ?? ""];

  if (!resolve || !slug) throw new Error(`RelatedPage href "${href}" is not a related-page route`);

  const target = resolve(slug, locale, (competitor) => t("ComparePage.alternativeTitle", { competitor }));

  if (!target) throw new Error(`RelatedPage href "${href}" resolves to no published page in ${locale}`);

  return (
    <div className="min-w-0">
      <HubPostCard {...target} href={href} locale={contentLocaleOrDefault(locale)} />
    </div>
  );
}
