import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { DocsPageHeader } from "../components/docs-page-header";
import { getDocMethod, getDocMethodColor, toLocaleRelativeHref } from "../docs.utils";
import { apiDocsSource, apiOverviewSource } from "@/core/fumadocs/source";
import { PageContainer } from "@/components/shared/page-container";
import { Alert } from "@/components/shared/alert";
import { AppLink } from "@/components/shared/app-link";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppChip } from "@/components/chip/app-chip";

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
    <PageContainer>
      <DocsPageHeader description={page.data.description} title={page.data.title} />

      <Alert color="warning">
        <p className="text-x-sm">{t("DocsPage.liveDataAlert")}</p>
      </Alert>

      {locale !== "en" && (
        <Alert color="primary">
          <p className="text-x-sm">{t("DocsPage.englishOnlyAlert")}</p>
        </Alert>
      )}

      <div
        className="grid gap-5"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 400px), 1fr))",
        }}
      >
        {docsOverviewItems.map((doc) => (
          <AppLink key={doc.url} className="interactive-surface block min-w-0 size-full text-foreground" href={doc.url}>
            <AppCard className="size-full min-w-0">
              <AppCardBody>
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <h2 className="text-x-md text-left grow min-w-0 truncate">{doc.title}</h2>

                  {doc.method && (
                    <AppChip className="uppercase shrink-0" variant={getDocMethodColor(doc.method)}>
                      {doc.method}
                    </AppChip>
                  )}
                </div>

                <p className="text-x-sm text-subdued my-auto wrap-break-word">{doc.description}</p>
              </AppCardBody>
            </AppCard>
          </AppLink>
        ))}
      </div>
    </PageContainer>
  );
}
