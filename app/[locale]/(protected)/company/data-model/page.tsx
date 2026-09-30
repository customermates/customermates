import { getGetRecordModelInteractor, getDiscoverRecordTypesInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { unwrapValidated } from "@/core/validation/validation.utils";
import { PageContainer } from "@/components/shared/page-container";
import { DataModelPageView } from "./components/data-model-page-view";

export default async function DataModelPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAccess();
  const [model, catalog, params] = await Promise.all([
    unwrapValidated(getGetRecordModelInteractor().invoke({})),
    unwrapValidated(
      getDiscoverRecordTypesInteractor().invoke({
        page: 1,
        pageSize: 1,
        includeEmbedded: false,
      }),
    ),
    searchParams,
  ]);
  return (
    <PageContainer>
      <DataModelPageView
        canManage={catalog.canManageSchema}
        initialModel={model}
        selectedTypeId={typeof params.typeId === "string" ? params.typeId : undefined}
      />
    </PageContainer>
  );
}
