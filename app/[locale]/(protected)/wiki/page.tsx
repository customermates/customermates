import { Resource } from "@/generated/prisma";

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
  let pages = await unwrapValidated(getGetWikiPagesInteractor().invoke({ page: listPage, pageSize: 100 }));
  if (pages.total > 0 && pages.items.length === 0)
    pages = await unwrapValidated(getGetWikiPagesInteractor().invoke({ page: 1, pageSize: 100 }));

  const requestedId = firstString(raw.page);
  const fallbackId = pages.items[0]?.id;
  const selectedId = requestedId ?? fallbackId;
  const selectedResult = selectedId ? await getGetWikiPageInteractor().invoke({ id: selectedId }) : null;
  let selectedPage = selectedResult?.ok ? selectedResult.data : null;

  if (!selectedPage && fallbackId && fallbackId !== selectedId) {
    const fallbackResult = await getGetWikiPageInteractor().invoke({ id: fallbackId });
    selectedPage = fallbackResult.ok ? fallbackResult.data : null;
  }

  return (
    <PageContainer padded={false}>
      <WikiPageView initialPage={selectedPage} listPage={pages} />
    </PageContainer>
  );
}
