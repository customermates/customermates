import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";

export interface WidgetCompatibilityRepo {
  hasLegacyDefinitions(): Promise<boolean>;
}

@AllowInDemoMode
@TenantInteractor()
export class GetWidgetCompatibilityInteractor extends AuthenticatedInteractor<void, { legacyDefinitions: boolean }> {
  constructor(private widgets: WidgetCompatibilityRepo) {
    super();
  }

  async invoke(): Promise<{ ok: true; data: { legacyDefinitions: boolean } }> {
    return { ok: true, data: { legacyDefinitions: await this.widgets.hasLegacyDefinitions() } };
  }
}
