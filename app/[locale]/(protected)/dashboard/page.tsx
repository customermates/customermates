import { DashboardPageView } from "./components/dashboard-page-view";

import { PageContainer } from "@/components/shared/page-container";
import { getDiscoverRecordTypesInteractor, getGetWidgetGalleryInteractor, getGetWidgetsInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";

export default async function DashboardPage() {
  await requireAccess();

  const [widgetsResult, recordTypesResult, galleryResult] = await Promise.all([
    getGetWidgetsInteractor().invoke(),
    getDiscoverRecordTypesInteractor().invoke({ includeEmbedded: true, page: 1, pageSize: 25 }),
    getGetWidgetGalleryInteractor().invoke(),
  ]);

  return (
    <PageContainer>
      <div className="relative flex min-h-0 w-full flex-1 flex-col gap-4 md:gap-6">
        <DashboardPageView
          gallery={galleryResult.ok ? galleryResult.data : undefined}
          recordTypes={recordTypesResult.ok ? recordTypesResult.data : undefined}
          widgets={widgetsResult.data}
        />
      </div>
    </PageContainer>
  );
}
