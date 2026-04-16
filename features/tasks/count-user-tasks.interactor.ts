import { z } from "zod";

import { BaseInteractor } from "@/core/base/base-interactor";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { type GetQueryParams, GetQueryParamsSchema } from "@/core/base/base-get.schema";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export abstract class CountTasksRepo {
  abstract getCount(params: GetQueryParams): Promise<number>;
}

@AllowInDemoMode
@TentantInteractor()
export class CountUserTasksInteractor extends BaseInteractor<GetQueryParams, number> {
  constructor(private repo: CountTasksRepo) {
    super();
  }

  @Enforce(GetQueryParamsSchema)
  @ValidateOutput(z.number())
  async invoke(params: GetQueryParams = {}): Promise<{ ok: true; data: number }> {
    return { ok: true as const, data: await this.repo.getCount(params) };
  }
}
