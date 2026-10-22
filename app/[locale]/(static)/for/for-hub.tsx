import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Footer } from "@/app/components/footer";
import { HubPagination } from "@/components/marketing/hub-pagination";
import { HubGrid, type HubGridGroup, type HubGridItem } from "@/components/marketing/hub-grid";
import { CTASection } from "@/components/marketing/cta-section";
import { JsonLd } from "@/components/seo/json-ld";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { featurePagesSource, forPagesSource, forSource } from "@/core/fumadocs/source";
import {
  hubPageCountForSource,
  hubPageHref,
  paginateLocalizedHubPages,
  resolveHubPageSegment,
} from "@/core/seo/hub-pagination";
import { breadcrumbListSchema } from "@/core/seo/schemas";
import { SOLUTION_CATALOG, type SolutionGroup } from "@/core/solutions/solution-catalog";
import {
  DEFAULT_LOCALE,
  type MarketingLocale,
  formattingTagFor,
  marketingLocaleOrDefault,
} from "@/i18n/locale-registry";

const PROFESSIONAL_SERVICES_PATH = "/for/professional-services";

function landingItem(landingPath: string, locale: MarketingLocale): HubGridItem | null {
  const [, base, slug] = landingPath.split("/");
  if (!slug) return null;

  if (base === "for") {
    const page = forPagesSource.getPage([slug], locale);
    return page ? { description: page.data.description, href: landingPath, name: page.data.industryName } : null;
  }

  if (base === "features") {
    const page = featurePagesSource.getPage([slug], locale);
    return page ? { description: page.data.description, href: landingPath, name: page.data.featureName } : null;
  }

  return null;
}

function solutionItems(group: SolutionGroup, locale: MarketingLocale): HubGridItem[] {
  return SOLUTION_CATALOG.filter((entry) => entry.group === group && entry.publicLocales.includes(locale)).flatMap(
    (entry) => landingItem(entry.landingPath, locale) ?? [],
  );
}

export function forHubSolutionGroups(locale: MarketingLocale, titles: Record<SolutionGroup, string>): HubGridGroup[] {
  return [
    {
      id: "team",
      items: [...solutionItems("team", locale), ...[landingItem(PROFESSIONAL_SERVICES_PATH, locale) ?? []].flat()],
      title: titles.team,
    },
    { id: "workflow", items: solutionItems("workflow", locale), title: titles.workflow },
  ];
}

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
  const locale = marketingLocaleOrDefault(rawLocale);
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

      <HubGrid
        groups={
          paginated.page === 1
            ? forHubSolutionGroups(locale, { team: t("ForHub.byTeam"), workflow: t("ForHub.byWorkflow") })
            : []
        }
        hero={{
          ...page.data.hero,
          title:
            pageNumber > 1
              ? `${page.data.hero.title} - ${t("Common.pageNumber", { page: pageNumber })}`
              : page.data.hero.title,
        }}
        items={items}
        resultsTitle={paginated.page === 1 ? t("ForHub.allGuides") : undefined}
      />

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
