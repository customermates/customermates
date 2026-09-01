import type { OperatorRepo } from "../operator.repo";
import type { HostedAiOperatorOverviewDto } from "../operator.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { failUnavailable } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { HostedAiOperatorOverviewDtoSchema } from "../operator.schema";

@OperatorInteractor
export class GetHostedAiOperatorOverviewInteractor {
  constructor(private readonly repo: OperatorRepo) {}

  @ValidateOutput(HostedAiOperatorOverviewDtoSchema)
  async invoke(): Validated<HostedAiOperatorOverviewDto> {
    const result = await this.repo.getOverviewUnscoped();
    if (result === "unavailable") return failUnavailable(CustomErrorCode.operatorUnavailable);
    if (typeof result === "string") return failUnavailable(CustomErrorCode.operatorUnavailable);

    return { ok: true, data: result };
  }
}
