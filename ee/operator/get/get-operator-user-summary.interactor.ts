import type { OperatorRepo } from "../operator.repo";
import type { OperatorUserSummaryDto } from "../operator.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { OperatorUserSummaryDtoSchema } from "../operator.schema";

@OperatorInteractor
export class GetOperatorUserSummaryInteractor {
  constructor(private readonly repo: OperatorRepo) {}

  @ValidateOutput(OperatorUserSummaryDtoSchema)
  async invoke(): Validated<OperatorUserSummaryDto> {
    return { ok: true, data: await this.repo.getUserSummaryUnscoped() };
  }
}
