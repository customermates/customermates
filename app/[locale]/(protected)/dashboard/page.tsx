import { WidgetsGrid } from "./components/widgets-grid";

import { XPageRow } from "@/components/x-layout-primitives/x-page-row";
import { XPageContainer } from "@/components/x-layout-primitives/x-page-container";
import { di } from "@/core/dependency-injection/container";
import { RouteGuardService } from "@/features/auth/route-guard.service";
import { GetWidgetsInteractor } from "@/features/widget/get-widgets.interactor";
import { GetCustomColumnsInteractor } from "@/features/custom-column/get-custom-columns.interactor";
import { GetWidgetFilterableFieldsInteractor } from "@/features/widget/get-widget-filterable-fields.interactor";

export default async function DashboardPage() {
  await di.get(RouteGuardService).ensureAccessOrRedirect();

  const [widgets, customColumns, filterableFields] = await Promise.all([
    di.get(GetWidgetsInteractor).invoke(),
    di.get(GetCustomColumnsInteractor).invoke(),
    di.get(GetWidgetFilterableFieldsInteractor).invoke(),
  ]);

  return (
    <XPageContainer>
      <XPageRow>
        <WidgetsGrid customColumns={customColumns} filterableFields={filterableFields} widgets={widgets} />
      </XPageRow>
    </XPageContainer>
  );
}
