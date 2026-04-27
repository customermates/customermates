import type { ExtendedWidget } from "./widget.types";
import type { WidgetService } from "./widget.service";
import type { GetWidgetsRepo } from "./get-widgets.interactor";

import { WidgetDtoSchema } from "./widget.schema";

import { BaseInteractor } from "@/core/base/base-interactor";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

@TentantInteractor()
export class RecalculateUserWidgetsInteractor extends BaseInteractor<void, ExtendedWidget[]> {
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
