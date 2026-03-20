import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { DocsPageHeader } from "../components/docs-page-header";
import { getDocMethod, getDocMethodColor, toLocaleRelativeHref } from "../docs.utils";

import { Footer } from "@/app/components/footer";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { apiDocsSource, apiOverviewSource } from "@/core/fumadocs/source";
import { XPageContainer } from "@/components/x-layout-primitives/x-page-container";
import { XAlert } from "@/components/x-alert";
import { XLink } from "@/components/x-link";
import { XCard } from "@/components/x-card/x-card";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XChip } from "@/components/x-chip/x-chip";

const GROUPS_ORDER = ["contact", "organization", "deal", "service", "task", "user"] as const;

function getDocsGroupKey(title: string | undefined): string {
  const titleLower = title?.toLowerCase();
  if (!titleLower) return "Other";
  for (const group of GROUPS_ORDER) if (titleLower.includes(group)) return group;
  return "Other";
}

function sortDocGroupEntries<T>(entries: [string, T][]): [string, T][] {
  return [...entries].sort(([groupA], [groupB]) => {
    const indexA = GROUPS_ORDER.indexOf(groupA as (typeof GROUPS_ORDER)[number]);
    const indexB = GROUPS_ORDER.indexOf(groupB as (typeof GROUPS_ORDER)[number]);

    if (indexA === -1 && indexB === -1) return groupA.localeCompare(groupB);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/docs/openapi" });
}

export default async function OpenApiOverviewPage() {
  const locale = await getLocale();
  const t = await getTranslations("");
  const page = apiOverviewSource.getPage(["openapi"], locale);

  if (!page) notFound();

  const docs = apiDocsSource.getPages(locale);
  const groupedDocs = docs.reduce<
    Record<string, Array<{ description: string; method?: string; title: string; url: string }>>
  >((acc, doc) => {
    const groupKey = getDocsGroupKey(doc.data.title);
    const method = getDocMethod(doc);

    if (!acc[groupKey]) acc[groupKey] = [];
    acc[groupKey].push({
      description: doc.data.description ?? "",
      method,
      title: doc.data.title ?? "",
      url: toLocaleRelativeHref(doc.url),
    });
    return acc;
  }, {});

  const docsOverviewItems = sortDocGroupEntries(Object.entries(groupedDocs)).flatMap(([, items]) => items);

  return (
    <XPageContainer>
      <DocsPageHeader description={page.data.description} title={page.data.title} />

      <XAlert color="warning">
        <p className="text-x-sm">{t("DocsPage.liveDataAlert")}</p>
      </XAlert>

      {locale !== "en" && (
        <XAlert color="primary">
          <p className="text-x-sm">{t("DocsPage.englishOnlyAlert")}</p>
        </XAlert>
      )}

      <div
        className="grid gap-5"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 400px), 1fr))",
        }}
      >
        {docsOverviewItems.map((doc) => (
          <XLink key={doc.url} className="block min-w-0 w-full h-full" color="foreground" href={doc.url}>
            <XCard isPressable className="h-full min-w-0 w-full">
              <XCardBody>
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <h2 className="text-x-md text-left grow min-w-0 truncate">{doc.title}</h2>

                  {doc.method && (
                    <XChip className="uppercase shrink-0" color={getDocMethodColor(doc.method)}>
                      {doc.method}
                    </XChip>
                  )}
                </div>

                <p className="text-x-sm text-subdued my-auto wrap-break-word">{doc.description}</p>
              </XCardBody>
            </XCard>
          </XLink>
        ))}
      </div>

      <div className="-mx-4 -mb-4 mt-auto pt-4 md:-mx-6 md:-mb-6 md:pt-6">
        <Footer />
      </div>
    </XPageContainer>
  );
}
