import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Footer } from "@/app/components/footer";
import { HubPagination } from "@/components/marketing/hub-pagination";
import { HubGrid, type HubGridItem } from "@/components/marketing/hub-grid";
import { CTASection } from "@/components/marketing/cta-section";
import { JsonLd } from "@/components/seo/json-ld";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { featurePagesSource, featuresAllSource } from "@/core/fumadocs/source";
import {
  hubPageCountForSource,
  hubPageHref,
  paginateLocalizedHubPages,
  resolveHubPageSegment,
} from "@/core/seo/hub-pagination";
import { breadcrumbListSchema } from "@/core/seo/schemas";
import { DEFAULT_LOCALE, contentLocaleOrDefault, formattingTagFor } from "@/i18n/locale-registry";

export function featuresAllHubPageCount(): number {
  return hubPageCountForSource(featurePagesSource);
}

export function featuresAllHubPageFromSegment(raw: string): number {
  const resolution = resolveHubPageSegment(raw, featuresAllHubPageCount());

  if (resolution.kind === "not-found") notFound();

  return resolution.page;
}

export async function generateFeaturesAllHubMetadata(locale: string, pageNumber: number): Promise<Metadata> {
  const t = await getTranslations({ locale });

  return generateMetadataFromMeta({
    canonicalPath: hubPageHref("/features/all", pageNumber),
    locale,
    route: "/features/all",
    descriptionSuffix: pageNumber > 1 ? t("Common.pageNumber", { page: pageNumber }) : undefined,
    titleSuffix: pageNumber > 1 ? t("Common.pageNumber", { page: pageNumber }) : undefined,
  });
}

export async function renderFeaturesAllHub(rawLocale: string, pageNumber: number) {
  const locale = contentLocaleOrDefault(rawLocale);
  const page = featuresAllSource.getPage(["all"], locale);

  if (!page) notFound();

  const t = await getTranslations();
  const collator = new Intl.Collator(formattingTagFor(locale));
  const referenceCollator = new Intl.Collator(formattingTagFor(DEFAULT_LOCALE));

  const referencePages = featurePagesSource.getPages(DEFAULT_LOCALE);
  const paginated = paginateLocalizedHubPages(referencePages, featurePagesSource.getPages(locale), pageNumber, (a, b) =>
    referenceCollator.compare(a.page.data.featureName, b.page.data.featureName),
  );
  const items: HubGridItem[] = paginated.items
    .map(({ page: p, slug }): HubGridItem => {
      return {
        description: p.data.description,
        href: `/features/${slug}`,
        name: p.data.featureName,
      };
    })
    .sort((a, b) => collator.compare(a.name, b.name));

  return (
    <div className="flex flex-col items-center justify-center">
      <JsonLd
        schema={breadcrumbListSchema([
          { name: t("StructuredData.breadcrumb.home"), path: `/${locale}` },
          {
            name: t("StructuredData.breadcrumb.features"),
            path: `/${locale}/features`,
          },
          {
            name: t("StructuredData.breadcrumb.allFeatures"),
            path: `/${locale}/features/all`,
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
        basePath="/features/all"
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
