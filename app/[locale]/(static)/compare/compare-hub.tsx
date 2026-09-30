import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Footer } from "@/app/components/footer";
import { HubPagination } from "@/components/marketing/hub-pagination";
import { HubGrid, type HubGridItem } from "@/components/marketing/hub-grid";
import { CTASection } from "@/components/marketing/cta-section";
import { JsonLd } from "@/components/seo/json-ld";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { comparePagesSource, compareSource } from "@/core/fumadocs/source";
import {
  hubPageCountForSource,
  hubPageHref,
  paginateLocalizedHubPages,
  resolveHubPageSegment,
} from "@/core/seo/hub-pagination";
import { compareDisplayTitle } from "@/core/seo/compare-title";
import { breadcrumbListSchema } from "@/core/seo/schemas";
import { DEFAULT_LOCALE, contentLocaleOrDefault, formattingTagFor } from "@/i18n/locale-registry";

export function compareHubPageCount(): number {
  return hubPageCountForSource(comparePagesSource);
}

export function compareHubPageFromSegment(raw: string): number {
  const resolution = resolveHubPageSegment(raw, compareHubPageCount());

  if (resolution.kind === "not-found") notFound();

  return resolution.page;
}

export async function generateCompareHubMetadata(locale: string, pageNumber: number): Promise<Metadata> {
  const t = await getTranslations({ locale });

  return generateMetadataFromMeta({
    canonicalPath: hubPageHref("/compare", pageNumber),
    locale,
    route: "/compare",
    descriptionSuffix: pageNumber > 1 ? t("Common.pageNumber", { page: pageNumber }) : undefined,
    titleSuffix: pageNumber > 1 ? t("Common.pageNumber", { page: pageNumber }) : undefined,
  });
}

export async function renderCompareHub(rawLocale: string, pageNumber: number) {
  const locale = contentLocaleOrDefault(rawLocale);
  const page = compareSource.getPage(["compare"], locale);

  if (!page) notFound();

  const t = await getTranslations();
  const collator = new Intl.Collator(formattingTagFor(locale));
  const referenceCollator = new Intl.Collator(formattingTagFor(DEFAULT_LOCALE));
  const referencePages = comparePagesSource.getPages(DEFAULT_LOCALE);
  const paginated = paginateLocalizedHubPages(referencePages, comparePagesSource.getPages(locale), pageNumber, (a, b) =>
    referenceCollator.compare(a.page.data.competitorName, b.page.data.competitorName),
  );
  const items: HubGridItem[] = paginated.items
    .map(({ page: p, slug }): HubGridItem => {
      const title = compareDisplayTitle(slug, p.data.competitorName, p.data.comparison?.competitor2Name, (competitor) =>
        t("ComparePage.alternativeTitle", { competitor }),
      );

      return {
        description: p.data.description,
        href: `/compare/${slug}`,
        name: title,
      };
    })
    .sort((a, b) => collator.compare(a.name, b.name));

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

      <HubGrid
        hero={{
          ...page.data.hero,
          title:
            pageNumber > 1
              ? `${page.data.hero.title} - ${t("Common.pageNumber", { page: pageNumber })}`
              : page.data.hero.title,
        }}
        items={items}
      />

      <HubPagination
        basePath="/compare"
        label={page.data.title}
        nextLabel={t("Common.table.nextPage")}
        page={paginated.page}
        pageCount={paginated.pageCount}
        previousLabel={t("Common.table.previousPage")}
      />

      <CTASection {...page.data.cta} />

      <Footer />
    </div>
  );
}
