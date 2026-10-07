import type { GetWidgetsRepo } from "./get-widgets.repo";
import type { Data } from "@/core/validation/validation.utils";
import type { DataViewStateRepo } from "@/core/data-view/data-view-state.repo";

import { z } from "zod";

import { WidgetDtoSchema } from "./widget.schema";

import { env } from "@/env";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { selectActiveViewKey } from "@/core/base/base-get.interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { ALL_VIEW_KEY, SURFACE } from "@/core/data-view/data-view-keys";
import { DataViewChipDtoSchema, DataViewStateWireSchema } from "@/core/data-view/data-view-state.schema";

const GetWidgetsSchema = z
  .object({
    viewId: z.string().optional(),
    allViews: z.boolean().optional(),
  })
  .strict()
  .optional();
export type GetWidgetsData = Data<typeof GetWidgetsSchema>;

export const DashboardWidgetsSchema = z.object({
  p13nId: z.literal(SURFACE.dashboard),
  items: z.array(WidgetDtoSchema),
  views: z.array(DataViewChipDtoSchema),
  activeViewKey: z.string(),
  allState: DataViewStateWireSchema,
  viewPersistable: z.boolean(),
});
export type DashboardWidgets = Data<typeof DashboardWidgetsSchema>;

@AllowInDemoMode
@TenantInteractor()
export class GetWidgetsInteractor extends AuthenticatedInteractor<GetWidgetsData, DashboardWidgets> {
  constructor(
    private repo: GetWidgetsRepo,
    private views: DataViewStateRepo,
  ) {
    super();
  }

  @Validate(GetWidgetsSchema)
  @ValidateOutput(DashboardWidgetsSchema)
  async invoke(data?: GetWidgetsData): Promise<{ ok: true; data: DashboardWidgets }> {
    const surface = await this.views.loadSurfaceState(SURFACE.dashboard);
    const readable = new Map(surface.views.map((view) => [view.id, view]));
    const activeViewKey = selectActiveViewKey(data?.viewId, surface.activeViewKey, readable);
    const items = await this.repo.getWidgets(
      data?.allViews ? undefined : activeViewKey === ALL_VIEW_KEY ? null : activeViewKey,
    );
    return {
      ok: true as const,
      data: {
        p13nId: SURFACE.dashboard,
        items,
        views: surface.views,
        activeViewKey,
        allState: surface.allState,
        viewPersistable: env.APP_MODE !== "demo",
      },
    };
  }
}
