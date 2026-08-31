import type { OperatorRepo } from "../operator.repo";
import type { HostedAiOperatorOverviewDto } from "../operator.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { HostedAiOperatorOverviewDtoSchema } from "../operator.schema";

@OperatorInteractor
export class GetHostedAiOperatorOverviewInteractor {
  constructor(private readonly repo: OperatorRepo) {}

  @ValidateOutput(HostedAiOperatorOverviewDtoSchema)
  async invoke(): Validated<HostedAiOperatorOverviewDto> {
    return { ok: true, data: await this.repo.getOverviewUnscoped() };
  }
}
