import { WidgetsGrid } from "./components/widgets-grid";

import { PageContainer } from "@/components/shared/page-container";
import {
  getGetWidgetsInteractor,
  getGetWidgetFilterableFieldsInteractor,
  getGetCustomColumnsInteractor,
} from "@/core/app-di";
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
      <div className="flex flex-col relative w-full gap-4 md:gap-6 grid-cols-1">
        <WidgetsGrid
          customColumns={customColumnsResult.data}
          filterableFields={filterableFieldsResult.data}
          widgets={widgetsResult.data}
        />
      </div>
    </PageContainer>
  );
}
