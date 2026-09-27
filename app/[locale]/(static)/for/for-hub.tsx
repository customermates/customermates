import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Footer } from "@/app/components/footer";
import { HubPagination } from "@/components/marketing/hub-pagination";
import { HubGrid, type HubGridItem } from "@/components/marketing/hub-grid";
import { CTASection } from "@/components/marketing/cta-section";
import { JsonLd } from "@/components/seo/json-ld";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { forPagesSource, forSource } from "@/core/fumadocs/source";
import {
  hubPageCountForSource,
  hubPageHref,
  paginateLocalizedHubPages,
  resolveHubPageSegment,
} from "@/core/seo/hub-pagination";
import { breadcrumbListSchema } from "@/core/seo/schemas";
import { DEFAULT_LOCALE, contentLocaleOrDefault, formattingTagFor } from "@/i18n/locale-registry";

export function forHubPageCount(): number {
  return hubPageCountForSource(forPagesSource);
}

export function forHubPageFromSegment(raw: string): number {
  const resolution = resolveHubPageSegment(raw, forHubPageCount());

  if (resolution.kind === "not-found") notFound();

  return resolution.page;
}

export async function generateForHubMetadata(locale: string, pageNumber: number): Promise<Metadata> {
  const t = await getTranslations({ locale });

  return generateMetadataFromMeta({
    canonicalPath: hubPageHref("/for", pageNumber),
    locale,
    route: "/for",
    descriptionSuffix: pageNumber > 1 ? t("Common.pageNumber", { page: pageNumber }) : undefined,
    titleSuffix: pageNumber > 1 ? t("Common.pageNumber", { page: pageNumber }) : undefined,
  });
}

export async function renderForHub(rawLocale: string, pageNumber: number) {
  const locale = contentLocaleOrDefault(rawLocale);
  const page = forSource.getPage(["for"], locale);

  if (!page) notFound();

  const t = await getTranslations();
  const collator = new Intl.Collator(formattingTagFor(locale));
  const referenceCollator = new Intl.Collator(formattingTagFor(DEFAULT_LOCALE));

  const referencePages = forPagesSource.getPages(DEFAULT_LOCALE);
  const paginated = paginateLocalizedHubPages(referencePages, forPagesSource.getPages(locale), pageNumber, (a, b) =>
    referenceCollator.compare(a.page.data.industryName, b.page.data.industryName),
  );
  const items: HubGridItem[] = paginated.items
    .map(({ page: p, slug }): HubGridItem => {
      return {
        description: p.data.description,
        href: `/for/${slug}`,
        name: p.data.industryName,
      };
    })
    .sort((a, b) => collator.compare(a.name, b.name));

  return (
    <div className="flex flex-col items-center justify-center">
      <JsonLd
        schema={breadcrumbListSchema([
          { name: t("StructuredData.breadcrumb.home"), path: `/${locale}` },
          {
            name: t("StructuredData.breadcrumb.industries"),
            path: `/${locale}/for`,
          },
        ])}
      />

      <HubGrid hero={page.data.hero} items={items} />

      <HubPagination
        basePath="/for"
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
