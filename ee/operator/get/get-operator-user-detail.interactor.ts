import type { OperatorRepo } from "../operator.repo";
import type { GetOperatorUserDetailData, OperatorUserDetailDto } from "../operator.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { operatorFailure } from "../operator.errors";
import { GetOperatorUserDetailSchema, OperatorUserDetailDtoSchema } from "../operator.schema";

@OperatorInteractor
export class GetOperatorUserDetailInteractor {
  constructor(private readonly repo: OperatorRepo) {}

  @Enforce(GetOperatorUserDetailSchema)
  @ValidateOutput(OperatorUserDetailDtoSchema)
  async invoke(data: GetOperatorUserDetailData): Validated<OperatorUserDetailDto> {
    try {
      const user = await this.repo.getUserDetailAuditedOrThrowUnscoped(data.userId);
      return { ok: true, data: user };
    } catch (error) {
      const failure = operatorFailure(error);
      if (failure) return failure;
      throw error;
    }
  }
}
