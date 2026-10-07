import { DashboardPageView } from "./components/dashboard-page-view";

import { PageContainer } from "@/components/shared/page-container";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { readSurfaceParams } from "@/core/data-view/next/read-surface-params";
import { getDiscoverRecordTypesInteractor, getGetWidgetGalleryInteractor, getGetWidgetsInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: Props) {
  await requireAccess();

  const params = await readSurfaceParams(SURFACE.dashboard, searchParams);
  const [widgetsResult, recordTypesResult, galleryResult] = await Promise.all([
    getGetWidgetsInteractor().invoke({ viewId: params.viewId }),
    getDiscoverRecordTypesInteractor().invoke({ includeEmbedded: true, page: 1, pageSize: 25 }),
    getGetWidgetGalleryInteractor().invoke(),
  ]);

  return (
    <PageContainer padded={false}>
      <DashboardPageView
        dashboard={widgetsResult.data}
        gallery={galleryResult.ok ? galleryResult.data : undefined}
        recordTypes={recordTypesResult.ok ? recordTypesResult.data : undefined}
      />
    </PageContainer>
  );
}
