import { notFound } from "next/navigation";
import { z } from "zod";

import { getGetRecordPresentationInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { readSurfaceParams } from "@/core/data-view/next/read-surface-params";
import { recordSurfaceKey } from "@/core/data-view/data-view-keys";
import { unwrapValidated } from "@/core/validation/validation.utils";
import { PageContainer } from "@/components/shared/page-container";
import { RecordsPageView } from "./components/records-page-view";

export default async function RecordsPage({
  params,
  searchParams,
}: {
  params: Promise<{ typeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAccess();
  const { typeId } = await params;
  if (!z.uuid().safeParse(typeId).success) notFound();
  const query = await readSurfaceParams(recordSurfaceKey(typeId), searchParams);
  const presentation = await unwrapValidated(getGetRecordPresentationInteractor().invoke({ typeId, params: query }));
  return (
    <PageContainer padded={false}>
      <RecordsPageView key={typeId} presentation={presentation} />
    </PageContainer>
  );
}
