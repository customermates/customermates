import { getGetRecordModelInteractor, getDiscoverRecordTypesInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { unwrapValidated } from "@/core/validation/validation.utils";
import { PageContainer } from "@/components/shared/page-container";
import { ConfigurePageView } from "./components/configure-page-view";

export default async function ConfigurePage() {
  await requireAccess();
  const [model, catalog] = await Promise.all([
    unwrapValidated(getGetRecordModelInteractor().invoke({})),
    unwrapValidated(
      getDiscoverRecordTypesInteractor().invoke({
        page: 1,
        pageSize: 1,
        includeEmbedded: false,
      }),
    ),
  ]);
  return (
    <PageContainer padded={false}>
      <ConfigurePageView
        canManage={catalog.canManageSchema}
        canPublishSummary={catalog.canPublishSummary ?? false}
        initialModel={model}
      />
    </PageContainer>
  );
}
