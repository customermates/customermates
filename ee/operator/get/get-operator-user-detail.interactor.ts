import type { OperatorRepo } from "../operator.repo";
import type { GetOperatorUserDetailData, OperatorUserDetailDto } from "../operator.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { failConflict, failNotFound, failUnavailable } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { GetOperatorUserDetailSchema, OperatorUserDetailDtoSchema } from "../operator.schema";

@OperatorInteractor
export class GetOperatorUserDetailInteractor {
  constructor(private readonly repo: OperatorRepo) {}

  @Enforce(GetOperatorUserDetailSchema)
  @ValidateOutput(OperatorUserDetailDtoSchema)
  async invoke(data: GetOperatorUserDetailData): Validated<OperatorUserDetailDto> {
    const result = await this.repo.getUserDetailUnscoped(data.userId);

    if (result === "connectedAccountsActive") return failConflict(CustomErrorCode.operatorConnectedAccountsActive);
    if (result === "allowanceMissing") return failConflict(CustomErrorCode.operatorAllowanceMissing);
    if (result === "conflict") return failConflict(CustomErrorCode.operatorConflict);
    if (result === "notFound") return failNotFound(CustomErrorCode.userNotFound);
    if (result === "unavailable") return failUnavailable(CustomErrorCode.operatorUnavailable);

    return { ok: true, data: result };
  }
}
