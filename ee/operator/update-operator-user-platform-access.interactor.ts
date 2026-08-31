import type { OperatorRepo } from "./operator.repo";
import type { UpdateOperatorUserPlatformAccessData, OperatorUserDetailDto } from "./operator.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { operatorFailure } from "./operator.errors";
import { OperatorUserDetailDtoSchema, UpdateOperatorUserPlatformAccessSchema } from "./operator.schema";

@OperatorInteractor
export class UpdateOperatorUserPlatformAccessInteractor {
  constructor(private readonly repo: OperatorRepo) {}

  @Enforce(UpdateOperatorUserPlatformAccessSchema)
  @ValidateOutput(OperatorUserDetailDtoSchema)
  async invoke(data: UpdateOperatorUserPlatformAccessData): Validated<OperatorUserDetailDto> {
    try {
      const result = await this.repo.updateUserPlatformAccessOrThrowUnscoped(data);
      return { ok: true, data: result };
    } catch (error) {
      const failure = operatorFailure(error);
      if (failure) return failure;
      throw error;
    }
  }
}
