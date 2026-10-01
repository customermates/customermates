import { DashboardPageView } from "./components/dashboard-page-view";

import { PageContainer } from "@/components/shared/page-container";
import { getDiscoverRecordTypesInteractor, getGetWidgetsInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";

export default async function DashboardPage() {
  await requireAccess();

  const [widgetsResult, recordTypesResult] = await Promise.all([
    getGetWidgetsInteractor().invoke(),
    getDiscoverRecordTypesInteractor().invoke({ includeEmbedded: true, page: 1, pageSize: 25 }),
  ]);

  return (
    <PageContainer>
      <div className="relative flex min-h-0 w-full flex-1 flex-col gap-4 md:gap-6">
        <DashboardPageView
          recordTypes={recordTypesResult.ok ? recordTypesResult.data : undefined}
          widgets={widgetsResult.data}
        />
      </div>
    </PageContainer>
  );
}
