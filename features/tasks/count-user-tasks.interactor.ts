import { z } from "zod";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { type GetQueryParams, GetQueryParamsSchema } from "@/core/base/base-get.schema";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export abstract class CountTasksRepo {
  abstract getCount(params: GetQueryParams): Promise<number>;
}

@AllowInDemoMode
@TenantInteractor()
export class CountUserTasksInteractor extends AuthenticatedInteractor<GetQueryParams, number> {
  constructor(private repo: CountTasksRepo) {
    super();
  }

  @Enforce(GetQueryParamsSchema)
  @ValidateOutput(z.number())
  async invoke(params: GetQueryParams = {}): Promise<{ ok: true; data: number }> {
    return { ok: true as const, data: await this.repo.getCount(params) };
  }
}
