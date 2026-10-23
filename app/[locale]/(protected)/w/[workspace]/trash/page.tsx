import { TrashPageView } from "./components/trash-page-view";

import { requireAccess } from "@/features/auth/next/require";
import { decodeGetParams } from "@/core/utils/get-params";
import { PageContainer } from "@/components/shared/page-container";

import { getQueryTrashInteractor } from "@/core/di";
import { unwrapPage } from "@/core/validation/next/unwrap-page";

import { toTrashQuery, toTrashResult } from "./components/trash-page-model";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TrashPage({ searchParams }: Props) {
  await requireAccess();
  const params = decodeGetParams(await searchParams);
  const query = toTrashQuery(params);
  const initialTrash = toTrashResult(params, query, await unwrapPage(getQueryTrashInteractor().invoke(query)));
  return (
    <PageContainer padded={false}>
      <TrashPageView initialTrash={initialTrash} />
    </PageContainer>
  );
}
