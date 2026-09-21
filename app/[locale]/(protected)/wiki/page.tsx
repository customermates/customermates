import { Resource } from "@/generated/prisma";
import { env } from "@/env";

import { PageContainer } from "@/components/shared/page-container";
import { getGetWikiPageInteractor, getGetWikiPagesInteractor } from "@/core/di";
import { unwrapValidated } from "@/core/validation/validation.utils";
import { requireAccess } from "@/features/auth/next/require";

import { WikiPageView } from "./components/wiki-page-view";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function WikiPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.wiki });

  const raw = await searchParams;
  const listPage = Math.max(1, Number.parseInt(firstString(raw.listPage) ?? "1", 10) || 1);
  let pages = await unwrapValidated(getGetWikiPagesInteractor().invoke({ page: listPage, pageSize: 25 }));
  if (pages.total > 0 && pages.items.length === 0)
    pages = await unwrapValidated(getGetWikiPagesInteractor().invoke({ page: 1, pageSize: 25 }));

  const requestedId = firstString(raw.page);
  const selectedId = requestedId ?? pages.items[0]?.id;
  const selectedResult = selectedId ? await getGetWikiPageInteractor().invoke({ id: selectedId }) : null;
  const selectedPage = selectedResult?.ok ? selectedResult.data : null;
  const pinnedPage =
    selectedPage && !pages.items.some(({ id }) => id === selectedPage.id)
      ? (({ markdown: _markdown, ...summary }) => summary)(selectedPage)
      : null;

  return (
    <PageContainer padded={false}>
      <WikiPageView
        initialPage={selectedPage}
        listPage={pages}
        pinnedPage={pinnedPage}
        readOnly={env.APP_MODE === "demo"}
        unavailable={Boolean(requestedId && !selectedPage)}
      />
    </PageContainer>
  );
}
