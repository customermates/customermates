import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { type GetQueryParams, GetQueryParamsSchema } from "@/core/base/base-get.schema";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";

export abstract class CountTasksRepo {
  abstract getCount(params: GetQueryParams): Promise<number>;
}

@AllowInDemoMode
@TentantInteractor()
export class CountUserTasksInteractor {
  constructor(private repo: CountTasksRepo) {}

  @Enforce(GetQueryParamsSchema)
  async invoke(params: GetQueryParams = {}): Promise<number> {
    return await this.repo.getCount(params);
  }
}
