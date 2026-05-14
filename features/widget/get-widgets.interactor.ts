import type { ExtendedWidget } from "./widget.types";

import { WidgetDtoSchema } from "./widget.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export abstract class GetWidgetsRepo {
  abstract getWidgets(): Promise<ExtendedWidget[]>;
}

@AllowInDemoMode
@TenantInteractor()
export class GetWidgetsInteractor extends AuthenticatedInteractor<void, ExtendedWidget[]> {
  constructor(private repo: GetWidgetsRepo) {
    super();
  }

  @ValidateOutput(WidgetDtoSchema)
  async invoke(): Promise<{ ok: true; data: ExtendedWidget[] }> {
    return { ok: true as const, data: await this.repo.getWidgets() };
  }
}
