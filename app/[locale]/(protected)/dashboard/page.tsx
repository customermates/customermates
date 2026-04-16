import { WidgetsGrid } from "./components/widgets-grid";

import { XPageRow } from "@/components/x-layout-primitives/x-page-row";
import { XPageContainer } from "@/components/x-layout-primitives/x-page-container";
import {
  getRouteGuardService,
  getGetWidgetsInteractor,
  getGetWidgetFilterableFieldsInteractor,
  getGetCustomColumnsInteractor,
} from "@/core/di";

export default async function DashboardPage() {
  await getRouteGuardService().ensureAccessOrRedirect();

  const [widgetsResult, customColumnsResult, filterableFieldsResult] = await Promise.all([
    getGetWidgetsInteractor().invoke(),
    getGetCustomColumnsInteractor().invoke(),
    getGetWidgetFilterableFieldsInteractor().invoke(),
  ]);

  return (
    <XPageContainer>
      <XPageRow>
        <WidgetsGrid
          customColumns={customColumnsResult.data}
          filterableFields={filterableFieldsResult.data}
          widgets={widgetsResult.data}
        />
      </XPageRow>
    </XPageContainer>
  );
}
