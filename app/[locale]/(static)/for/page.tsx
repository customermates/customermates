import type { Metadata } from "next";

import { notFound, permanentRedirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { Footer } from "@/app/components/footer";
import { HubPagination } from "@/components/marketing/hub-pagination";
import { HubGrid, type HubGridItem } from "@/components/marketing/hub-grid";
import { CTASection } from "@/components/marketing/cta-section";
import { JsonLd } from "@/components/seo/json-ld";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { forPagesSource, forSource } from "@/core/fumadocs/source";
import {
  HUB_PAGE_PARAM,
  hubPageCount,
  hubPageCountForSource,
  hubPageHref,
  hubPageOneRedirectHref,
  paginateLocalizedHubPages,
  resolveHubPage,
} from "@/core/seo/hub-pagination";
import { breadcrumbListSchema } from "@/core/seo/schemas";
import { DEFAULT_LOCALE, buildLocalePath, contentLocaleOrDefault, formattingTagFor } from "@/i18n/locale-registry";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params;
  const query = await searchParams;
  const resolution = resolveHubPage(query[HUB_PAGE_PARAM], hubPageCountForSource(forPagesSource));

  if (resolution.kind === "not-found") notFound();

  const t = await getTranslations({ locale });

  return generateMetadataFromMeta({
    canonicalPath: hubPageHref("/for", resolution.page),
    locale,
    route: "/for",
    descriptionSuffix: resolution.page > 1 ? t("Common.pageNumber", { page: resolution.page }) : undefined,
    titleSuffix: resolution.page > 1 ? t("Common.pageNumber", { page: resolution.page }) : undefined,
  });
}

export default async function ForHubPage({ searchParams }: Props) {
  const locale = contentLocaleOrDefault(await getLocale());
  const page = forSource.getPage(["for"], locale);

  if (!page) notFound();

  const t = await getTranslations();
  const collator = new Intl.Collator(formattingTagFor(locale));
  const referenceCollator = new Intl.Collator(formattingTagFor(DEFAULT_LOCALE));

  const referencePages = forPagesSource.getPages(DEFAULT_LOCALE);
  const query = await searchParams;
  const resolution = resolveHubPage(query[HUB_PAGE_PARAM], hubPageCount(referencePages.length));

  if (resolution.kind === "not-found") notFound();
  if (resolution.kind === "redirect-page-one")
    permanentRedirect(buildLocalePath(locale, hubPageOneRedirectHref("/for", query)));

  const paginated = paginateLocalizedHubPages(
    referencePages,
    forPagesSource.getPages(locale),
    resolution.page,
    (a, b) => referenceCollator.compare(a.page.data.industryName, b.page.data.industryName),
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
