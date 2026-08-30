import type { PrismaOperatorRiskSummaryRepo } from "../prisma-operator-lists.repository";
import type { OperatorRiskSummaryDto } from "../operator-lists.schema";

import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";

@OperatorInteractor
export class GetOperatorRiskSummaryInteractor {
  constructor(private readonly repo: PrismaOperatorRiskSummaryRepo) {}

  async invoke(): Promise<OperatorRiskSummaryDto> {
    return this.repo.getRiskSummaryUnscoped();
  }
}
