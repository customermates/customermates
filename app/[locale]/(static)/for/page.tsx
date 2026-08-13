import type { Metadata } from "next";

import { notFound, permanentRedirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { Footer } from "@/app/components/footer";
import { HubPagination } from "@/components/marketing/hub-pagination";
import { HubPostGrid, type HubPostGridItem } from "@/components/marketing/hub-post-grid";
import { JsonLd } from "@/components/seo/json-ld";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { forPagesSource, forSource } from "@/core/fumadocs/source";
import {
  HUB_PAGE_PARAM,
  hubPageCount,
  hubPageHref,
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
  const resolution = resolveHubPage(
    (await searchParams)[HUB_PAGE_PARAM],
    hubPageCount(forPagesSource.getPages(DEFAULT_LOCALE).length),
  );

  if (resolution.kind === "not-found") notFound();

  return generateMetadataFromMeta({
    canonicalPath: hubPageHref("/for", resolution.page),
    locale,
    route: "/for",
  });
}

export default async function ForHubPage({ searchParams }: Props) {
  const locale = contentLocaleOrDefault(await getLocale());
  const page = forSource.getPage(["for"], locale);

  if (!page) notFound();

  const t = await getTranslations();
  const tagLabel = t("Common.tags.industry");
  const collator = new Intl.Collator(formattingTagFor(locale));
  const referenceCollator = new Intl.Collator(formattingTagFor(DEFAULT_LOCALE));

  const referencePages = forPagesSource.getPages(DEFAULT_LOCALE);
  const resolution = resolveHubPage((await searchParams)[HUB_PAGE_PARAM], hubPageCount(referencePages.length));

  if (resolution.kind === "not-found") notFound();
  if (resolution.kind === "redirect-page-one") permanentRedirect(buildLocalePath(locale, "/for"));

  const paginated = paginateLocalizedHubPages(
    referencePages,
    forPagesSource.getPages(locale),
    resolution.page,
    (a, b) => referenceCollator.compare(a.page.data.industryName, b.page.data.industryName),
  );
  const items: HubPostGridItem[] = paginated.items
    .map(({ page: p, slug }): HubPostGridItem => {
      return {
        description: p.data.description,
        href: `/for/${slug}`,
        imageSrc: `${slug}.png`,
        tag: tagLabel,
        title: p.data.industryName,
      };
    })
    .sort((a, b) => collator.compare(a.title, b.title));

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

      <HubPostGrid hero={page.data.hero} items={items} locale={locale} />

      <HubPagination
        basePath="/for"
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
