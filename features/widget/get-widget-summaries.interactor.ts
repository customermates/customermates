import type { GetWidgetsRepo } from "./get-widgets.repo";
import type { DataViewStateRepo } from "@/core/data-view/data-view-state.repo";
import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { selectActiveViewKey } from "@/core/base/base-get.interactor";
import { ALL_VIEW_KEY, SURFACE } from "@/core/data-view/data-view-keys";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { GetWidgetsSchema } from "./get-widgets.interactor";
import { WidgetLayoutSchema } from "./widget-display.schema";

const WidgetSummariesSchema = z.object({
  activeViewKey: z.string(),
  items: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      kind: z.enum(["chart", "activityTimeline", "calendar", "map"]),
      version: z.number().int(),
      viewId: z.string().nullable(),
      layout: WidgetLayoutSchema.nullable(),
    }),
  ),
});

@AllowInDemoMode
@TenantInteractor()
export class GetWidgetSummariesInteractor extends AuthenticatedInteractor<
  Data<typeof GetWidgetsSchema>,
  Data<typeof WidgetSummariesSchema>
> {
  constructor(
    private repo: GetWidgetsRepo,
    private views: DataViewStateRepo,
  ) {
    super();
  }

  @Validate(GetWidgetsSchema)
  @ValidateOutput(WidgetSummariesSchema)
  async invoke(input?: Data<typeof GetWidgetsSchema>) {
    const surface = await this.views.loadSurfaceState(SURFACE.dashboard);
    const activeViewKey = selectActiveViewKey(
      input?.viewId,
      surface.activeViewKey,
      new Map(surface.views.map((view) => [view.id, view])),
    );
    const stored = await this.repo.getWidgets(
      input?.allViews ? undefined : activeViewKey === ALL_VIEW_KEY ? null : activeViewKey,
    );
    return {
      ok: true as const,
      data: {
        activeViewKey,
        items: stored.map(({ kind, widget }) => ({
          id: widget.id,
          name: widget.name,
          kind,
          version: widget.version,
          viewId: widget.viewId,
          layout: widget.layout,
        })),
      },
    };
  }
}
