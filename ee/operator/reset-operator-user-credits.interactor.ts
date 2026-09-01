import type { OperatorRepo } from "./operator.repo";
import type { ResetOperatorUserCreditsData, ResetOperatorUserCreditsResultDto } from "./operator.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { failConflict, failNotFound, failUnavailable } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { ResetOperatorUserCreditsResultDtoSchema, ResetOperatorUserCreditsSchema } from "./operator.schema";

@OperatorInteractor
export class ResetOperatorUserCreditsInteractor {
  constructor(private readonly repo: OperatorRepo) {}

  @Enforce(ResetOperatorUserCreditsSchema)
  @ValidateOutput(ResetOperatorUserCreditsResultDtoSchema)
  async invoke(data: ResetOperatorUserCreditsData): Validated<ResetOperatorUserCreditsResultDto> {
    const result = await this.repo.resetUserCreditsUnscoped(data);

    if (result === "allowanceMissing") return failConflict(CustomErrorCode.operatorAllowanceMissing);
    if (result === "conflict") return failConflict(CustomErrorCode.operatorConflict);
    if (result === "notFound") return failNotFound(CustomErrorCode.userNotFound);
    if (result === "unavailable") return failUnavailable(CustomErrorCode.operatorUnavailable);

    return { ok: true, data: result };
  }
}
