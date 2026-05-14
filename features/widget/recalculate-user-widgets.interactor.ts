import type { ExtendedWidget } from "./widget.types";
import type { WidgetService } from "./widget.service";
import type { GetWidgetsRepo } from "./get-widgets.interactor";

import { WidgetDtoSchema } from "./widget.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

@TenantInteractor()
export class RecalculateUserWidgetsInteractor extends AuthenticatedInteractor<void, ExtendedWidget[]> {
  constructor(
    private widgetService: WidgetService,
    private repo: GetWidgetsRepo,
  ) {
    super();
  }

  @ValidateOutput(WidgetDtoSchema)
  async invoke(): Promise<{ ok: true; data: ExtendedWidget[] }> {
    await this.widgetService.recalculateUserWidgets();
    return { ok: true as const, data: await this.repo.getWidgets() };
  }
}
