import type { OperatorRepo } from "./operator.repo";
import type { OperatorUserSummaryDto } from "./operator.schema";

import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";

@OperatorInteractor
export class GetOperatorUserSummaryInteractor {
  constructor(private readonly repo: OperatorRepo) {}

  async invoke(): Promise<OperatorUserSummaryDto> {
    return this.repo.getUserSummaryAuditedUnscoped();
  }
}
