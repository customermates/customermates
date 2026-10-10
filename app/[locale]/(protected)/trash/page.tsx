import { TrashPageView } from "./components/trash-page-view";

import { requireAccess } from "@/features/auth/next/require";
import { decodeGetParams } from "@/core/utils/get-params";
import { PageContainer } from "@/components/shared/page-container";

import { getTrashAction } from "./actions";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TrashPage({ searchParams }: Props) {
  await requireAccess();
  const initialTrash = await getTrashAction(decodeGetParams(await searchParams));
  return (
    <PageContainer padded={false}>
      <TrashPageView initialTrash={initialTrash} />
    </PageContainer>
  );
}
