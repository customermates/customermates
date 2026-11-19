import type { WikiGraph } from "@/features/wiki/wiki-graph.schema";

import { Resource } from "@/generated/prisma";

import { PageContainer } from "@/components/shared/page-container";
import * as ErrorReporter from "@/core/observability/server";
import { getGetWikiGraphInteractor, getGetWikiHomepageSetupStateInteractor, getGetWikiPageInteractor } from "@/core/di";
import { unwrapPage } from "@/core/validation/next/unwrap-page";
import { requireAccess } from "@/features/auth/next/require";
import { getOptionalP13n } from "@/features/p13n/next/get-optional-p13n";
import { readP13nSettings, WIKI_LAYOUT_P13N_ID } from "@/features/p13n/p13n-settings.schema";

import { WikiPageView } from "./components/wiki-page-view";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function loadGraph(): Promise<WikiGraph | null> {
  try {
    const result = await getGetWikiGraphInteractor().invoke({});
    return result.ok ? result.data : null;
  } catch (error) {
    ErrorReporter.captureException(error, { tags: { kind: "wiki-graph-page" } });
    return null;
  }
}

export default async function WikiPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.wiki });

  const raw = await searchParams;
  const requestedId = firstString(raw.page);
  const [graph, setupState, selectedResult, layout] = await Promise.all([
    loadGraph(),
    unwrapPage(getGetWikiHomepageSetupStateInteractor().invoke()),
    requestedId ? getGetWikiPageInteractor().invoke({ id: requestedId }) : null,
    getOptionalP13n(WIKI_LAYOUT_P13N_ID),
  ]);
  const selectedPage = selectedResult?.ok ? selectedResult.data : null;
  const view = readP13nSettings(WIKI_LAYOUT_P13N_ID, layout?.settings)?.view ?? "map";

  return (
    <PageContainer padded={false}>
      <WikiPageView
        graph={graph}
        initialPage={selectedPage}
        initialSetupState={setupState}
        initialView={view}
        openProposals={firstString(raw.proposals) === "open"}
        requestedPageId={requestedId}
        unavailable={Boolean(requestedId && !selectedPage)}
      />
    </PageContainer>
  );
}
