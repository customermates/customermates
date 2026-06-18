import { z } from "zod";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";

export abstract class GetUnreadThreadCountRepo {
  abstract countUnreadThreadsForCurrentUser(): Promise<number>;
}

@AllowInDemoMode
@TenantInteractor()
export class GetUnreadThreadCountInteractor extends AuthenticatedInteractor<void, number> {
  constructor(private repo: GetUnreadThreadCountRepo) {
    super();
  }

  @ValidateOutput(z.number())
  async invoke(): Promise<{ ok: true; data: number }> {
    const count = await this.repo.countUnreadThreadsForCurrentUser();

    return { ok: true as const, data: count };
  }
}
