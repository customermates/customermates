import type { PrismaOperatorRiskSummaryRepo } from "../prisma-operator-risk-summary.repository";
import type { OperatorRiskSummaryDto } from "../operator-lists.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { OperatorRiskSummaryDtoSchema } from "../operator-lists.schema";

@OperatorInteractor
export class GetOperatorRiskSummaryInteractor {
  constructor(private readonly repo: PrismaOperatorRiskSummaryRepo) {}

  @ValidateOutput(OperatorRiskSummaryDtoSchema)
  async invoke(): Validated<OperatorRiskSummaryDto> {
    return { ok: true, data: await this.repo.getRiskSummaryUnscoped() };
  }
}
