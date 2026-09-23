import { z } from "zod";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export abstract class CountChannelsNeedingActionRepo {
  abstract countAccountsNeedingAction(): Promise<number>;
}

@AllowInDemoMode
@TenantInteractor()
export class CountChannelsNeedingActionInteractor extends AuthenticatedInteractor<void, number> {
  constructor(private repo: CountChannelsNeedingActionRepo) {
    super();
  }

  @ValidateOutput(z.number())
  async invoke(): Promise<{ ok: true; data: number }> {
    return { ok: true as const, data: await this.repo.countAccountsNeedingAction() };
  }
}
