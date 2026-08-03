import type { WidgetDto } from "./widget.schema";

import { WidgetDtoSchema } from "./widget.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export abstract class GetWidgetsRepo {
  abstract getWidgets(): Promise<WidgetDto[]>;
}

@AllowInDemoMode
@TenantInteractor()
export class GetWidgetsInteractor extends AuthenticatedInteractor<void, WidgetDto[]> {
  constructor(private repo: GetWidgetsRepo) {
    super();
  }

  @ValidateOutput(WidgetDtoSchema)
  async invoke(): Promise<{ ok: true; data: WidgetDto[] }> {
    return { ok: true as const, data: await this.repo.getWidgets() };
  }
}
