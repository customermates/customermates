import type { OperatorRepo } from "./operator.repo";
import type { HostedAiOperatorOverviewDto } from "./operator.schema";

import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";

@OperatorInteractor
export class GetHostedAiOperatorOverviewInteractor {
  constructor(private readonly repo: OperatorRepo) {}

  async invoke(): Promise<HostedAiOperatorOverviewDto> {
    return this.repo.getOverviewAuditedUnscoped();
  }
}
