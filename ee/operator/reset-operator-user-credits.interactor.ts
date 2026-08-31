import type { OperatorRepo } from "./operator.repo";
import type { ResetOperatorUserCreditsData, ResetOperatorUserCreditsResultDto } from "./operator.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { operatorFailure } from "./operator.errors";
import { ResetOperatorUserCreditsResultDtoSchema, ResetOperatorUserCreditsSchema } from "./operator.schema";

@OperatorInteractor
export class ResetOperatorUserCreditsInteractor {
  constructor(private readonly repo: OperatorRepo) {}

  @Enforce(ResetOperatorUserCreditsSchema)
  @ValidateOutput(ResetOperatorUserCreditsResultDtoSchema)
  async invoke(data: ResetOperatorUserCreditsData): Validated<ResetOperatorUserCreditsResultDto> {
    try {
      const result = await this.repo.resetUserCreditsOrThrowUnscoped(data);
      return { ok: true, data: result };
    } catch (error) {
      const failure = operatorFailure(error);
      if (failure) return failure;
      throw error;
    }
  }
}
