import type { ReactNode } from "react";

import { ArrowUpRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { AppLink } from "@/components/shared/app-link";
import {
  blogPostsSource,
  comparePagesSource,
  docsSource,
  featurePagesSource,
  forPagesSource,
} from "@/core/fumadocs/source";
import { compareDisplayTitle } from "@/core/seo/compare-title";
import { type RelatedRouteSegment, type RelatedTargetResolver, resolveRelatedTarget } from "./related-target";

const RELATED_SEGMENTS: Record<RelatedRouteSegment, RelatedTargetResolver> = {
  blog: (slug, locale) => {
    const page = blogPostsSource.getPage([slug], locale);
    if (!page) return null;

    return {
      description: page.data.description,
      title: page.data.title,
    };
  },
  compare: (slug, locale, alternativeTitle) => {
    const page = comparePagesSource.getPage([slug], locale);
    if (!page) return null;

    return {
      description: page.data.description,
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
      title: page.data.featureName,
    };
  },
  for: (slug, locale) => {
    const page = forPagesSource.getPage([slug], locale);
    if (!page) return null;

    return {
      description: page.data.description,
      title: page.data.industryName,
    };
  },
};

export async function RelatedPages({ children }: { children: ReactNode }) {
  const t = await getTranslations();

  return (
    <section>
      <h2 className="text-2xl font-medium tracking-tight text-balance">{t("Common.relatedPages")}</h2>

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

  const segment = href.slice(1).split("/", 1)[0] as RelatedRouteSegment;
  const category = {
    blog: t("StructuredData.breadcrumb.blog"),
    compare: t("StructuredData.breadcrumb.compare"),
    docs: t("NavigationBar.docs"),
    features: t("StructuredData.breadcrumb.features"),
    for: t("StructuredData.breadcrumb.industries"),
  }[segment];

  return (
    <AppLink
      appearance="unstyled"
      className="group flex min-h-40 min-w-0 flex-col border-t border-border py-5 text-foreground"
      href={href}
    >
      <div className="flex items-center justify-between gap-3 text-xs font-medium uppercase tracking-wide text-subdued">
        <span>{category}</span>

        <ArrowUpRight
          aria-hidden
          className="size-4 shrink-0 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
        />
      </div>

      <h3 className="mt-5 text-lg font-semibold leading-snug text-balance">{target.title}</h3>

      <p className="mt-2 line-clamp-3 text-sm leading-6 text-subdued">{target.description}</p>
    </AppLink>
  );
}
