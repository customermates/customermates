import type { Metadata } from "next";

import { notFound, permanentRedirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { Footer } from "@/app/components/footer";
import { HubPagination } from "@/components/marketing/hub-pagination";
import { HubPostGrid, type HubPostGridItem } from "@/components/marketing/hub-post-grid";
import { JsonLd } from "@/components/seo/json-ld";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { featurePagesSource, featuresAllSource } from "@/core/fumadocs/source";
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
  const resolution = resolveHubPage(query[HUB_PAGE_PARAM], hubPageCountForSource(featurePagesSource));

  if (resolution.kind === "not-found") notFound();

  const t = await getTranslations({ locale });

  return generateMetadataFromMeta({
    canonicalPath: hubPageHref("/features/all", resolution.page),
    locale,
    route: "/features/all",
    descriptionSuffix: resolution.page > 1 ? t("Common.pageNumber", { page: resolution.page }) : undefined,
    titleSuffix: resolution.page > 1 ? t("Common.pageNumber", { page: resolution.page }) : undefined,
  });
}

export default async function FeaturesAllHubPage({ searchParams }: Props) {
  const locale = contentLocaleOrDefault(await getLocale());
  const page = featuresAllSource.getPage(["all"], locale);

  if (!page) notFound();

  const t = await getTranslations();
  const tagLabel = t("Common.tags.feature");
  const collator = new Intl.Collator(formattingTagFor(locale));
  const referenceCollator = new Intl.Collator(formattingTagFor(DEFAULT_LOCALE));

  const referencePages = featurePagesSource.getPages(DEFAULT_LOCALE);
  const query = await searchParams;
  const resolution = resolveHubPage(query[HUB_PAGE_PARAM], hubPageCount(referencePages.length));

  if (resolution.kind === "not-found") notFound();
  if (resolution.kind === "redirect-page-one")
    permanentRedirect(buildLocalePath(locale, hubPageOneRedirectHref("/features/all", query)));

  const paginated = paginateLocalizedHubPages(
    referencePages,
    featurePagesSource.getPages(locale),
    resolution.page,
    (a, b) => referenceCollator.compare(a.page.data.featureName, b.page.data.featureName),
  );
  const items: HubPostGridItem[] = paginated.items
    .map(({ page: p, slug }): HubPostGridItem => {
      return {
        description: p.data.description,
        href: `/features/${slug}`,
        imageSrc: p.data.acquisition ? undefined : `${slug}.png`,
        tag: tagLabel,
        title: p.data.featureName,
      };
    })
    .sort((a, b) => collator.compare(a.title, b.title));

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

      <HubPostGrid hero={page.data.hero} items={items} locale={locale} />

      <HubPagination
        basePath="/features/all"
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
