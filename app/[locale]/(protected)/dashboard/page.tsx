import { DashboardPageView } from "./components/dashboard-page-view";

import { PageContainer } from "@/components/shared/page-container";
import {
  getDiscoverRecordTypesInteractor,
  getGetCustomColumnsInteractor,
  getGetWidgetFilterableFieldsInteractor,
  getGetWidgetsInteractor,
  getGetWidgetCompatibilityInteractor,
} from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";

export default async function DashboardPage() {
  await requireAccess();

  const [widgetsResult, compatibility, recordTypesResult] = await Promise.all([
    getGetWidgetsInteractor().invoke(),
    getGetWidgetCompatibilityInteractor().invoke(),
    getDiscoverRecordTypesInteractor().invoke({ includeEmbedded: true, page: 1, pageSize: 25 }),
  ]);
  const legacyRequired =
    !recordTypesResult.ok || recordTypesResult.data.schemaRevision === 0 || compatibility.data.legacyDefinitions;
  const [customColumnsResult, filterableFieldsResult] = legacyRequired
    ? await Promise.all([getGetCustomColumnsInteractor().invoke(), getGetWidgetFilterableFieldsInteractor().invoke()])
    : [
        { data: [] },
        { data: { chart: { contact: [], organization: [], deal: [], service: [], task: [] }, activityTimeline: [] } },
      ];

  return (
    <PageContainer>
      <div className="relative flex min-h-0 w-full flex-1 flex-col gap-4 md:gap-6">
        <DashboardPageView
          activityFilterableFields={filterableFieldsResult.data.activityTimeline}
          customColumns={customColumnsResult.data}
          filterableFields={filterableFieldsResult.data.chart}
          recordTypes={recordTypesResult.ok ? recordTypesResult.data : undefined}
          widgets={widgetsResult.data}
        />
      </div>
    </PageContainer>
  );
}
