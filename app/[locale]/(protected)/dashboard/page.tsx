import { DashboardPageView } from "./components/dashboard-page-view";

import { PageContainer } from "@/components/shared/page-container";
import {
  getGetWidgetsInteractor,
  getGetWidgetFilterableFieldsInteractor,
  getGetCustomColumnsInteractor,
} from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
export default async function DashboardPage() {
  await requireAccess();

  const [widgetsResult, customColumnsResult, filterableFieldsResult] = await Promise.all([
    getGetWidgetsInteractor().invoke(),
    getGetCustomColumnsInteractor().invoke(),
    getGetWidgetFilterableFieldsInteractor().invoke(),
  ]);

  return (
    <PageContainer>
      <div className="relative flex min-h-0 w-full flex-1 flex-col gap-4 md:gap-6">
        <DashboardPageView
          customColumns={customColumnsResult.data}
          filterableFields={filterableFieldsResult.data}
          widgets={widgetsResult.data}
        />
      </div>
    </PageContainer>
  );
}
