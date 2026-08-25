import type { Metadata } from "next";

import { notFound, permanentRedirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { Footer } from "@/app/components/footer";
import { HubPagination } from "@/components/marketing/hub-pagination";
import { HubPostGrid, type HubPostGridItem } from "@/components/marketing/hub-post-grid";
import { JsonLd } from "@/components/seo/json-ld";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { comparePagesSource, compareSource } from "@/core/fumadocs/source";
import {
  HUB_PAGE_PARAM,
  hubPageCount,
  hubPageCountForSource,
  hubPageHref,
  hubPageOneRedirectHref,
  paginateLocalizedHubPages,
  resolveHubPage,
} from "@/core/seo/hub-pagination";
import { compareDisplayTitle } from "@/core/seo/compare-title";
import { breadcrumbListSchema } from "@/core/seo/schemas";
import { DEFAULT_LOCALE, buildLocalePath, contentLocaleOrDefault, formattingTagFor } from "@/i18n/locale-registry";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params;
  const query = await searchParams;
  const resolution = resolveHubPage(query[HUB_PAGE_PARAM], hubPageCountForSource(comparePagesSource));

  if (resolution.kind === "not-found") notFound();

  const t = await getTranslations({ locale });

  return generateMetadataFromMeta({
    canonicalPath: hubPageHref("/compare", resolution.page),
    locale,
    route: "/compare",
    titleSuffix: resolution.page > 1 ? t("Common.pageNumber", { page: resolution.page }) : undefined,
  });
}

export default async function CompareHubPage({ searchParams }: Props) {
  const locale = contentLocaleOrDefault(await getLocale());
  const page = compareSource.getPage(["compare"], locale);

  if (!page) notFound();

  const t = await getTranslations();
  const collator = new Intl.Collator(formattingTagFor(locale));
  const referenceCollator = new Intl.Collator(formattingTagFor(DEFAULT_LOCALE));
  const tagLabels = {
    alternative: t("ComparePage.tags.alternative"),
    comparison: t("ComparePage.tags.comparison"),
    review: t("ComparePage.tags.review"),
  };

  const referencePages = comparePagesSource.getPages(DEFAULT_LOCALE);
  const query = await searchParams;
  const resolution = resolveHubPage(query[HUB_PAGE_PARAM], hubPageCount(referencePages.length));

  if (resolution.kind === "not-found") notFound();
  if (resolution.kind === "redirect-page-one")
    permanentRedirect(buildLocalePath(locale, hubPageOneRedirectHref("/compare", query)));

  const paginated = paginateLocalizedHubPages(
    referencePages,
    comparePagesSource.getPages(locale),
    resolution.page,
    (a, b) => referenceCollator.compare(a.page.data.competitorName, b.page.data.competitorName),
  );
  const items: HubPostGridItem[] = paginated.items
    .map(({ page: p, slug }): HubPostGridItem => {
      const title = compareDisplayTitle(slug, p.data.competitorName, p.data.comparison?.competitor2Name, (competitor) =>
        t("ComparePage.alternativeTitle", { competitor }),
      );

      return {
        description: p.data.description,
        href: `/compare/${slug}`,
        imageSrc: `${slug}.png`,
        tag: slug.endsWith("-alternative")
          ? tagLabels.alternative
          : slug.includes("-vs-")
            ? tagLabels.comparison
            : tagLabels.review,
        title,
      };
    })
    .sort((a, b) => collator.compare(a.title, b.title));

  return (
    <div className="flex flex-col items-center justify-center">
      <JsonLd
        schema={breadcrumbListSchema([
          { name: t("StructuredData.breadcrumb.home"), path: `/${locale}` },
          {
            name: t("StructuredData.breadcrumb.compare"),
            path: `/${locale}/compare`,
          },
        ])}
      />

      <HubPostGrid hero={page.data.hero} items={items} locale={locale} />

      <HubPagination
        basePath="/compare"
        label={page.data.title}
        nextLabel={t("Common.table.nextPage")}
        page={paginated.page}
        pageCount={paginated.pageCount}
        previousLabel={t("Common.table.previousPage")}
      />

      <Footer />
    </div>
  );
}
