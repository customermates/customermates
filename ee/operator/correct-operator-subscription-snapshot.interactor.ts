import type { OperatorRepo } from "./operator.repo";
import type { CorrectOperatorSubscriptionSnapshotData, OperatorUserDetailDto } from "./operator.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { operatorFailure } from "./operator.errors";
import { OperatorUserDetailDtoSchema, CorrectOperatorSubscriptionSnapshotSchema } from "./operator.schema";

@OperatorInteractor
export class CorrectOperatorSubscriptionSnapshotInteractor {
  constructor(private readonly repo: OperatorRepo) {}

  @Enforce(CorrectOperatorSubscriptionSnapshotSchema)
  @ValidateOutput(OperatorUserDetailDtoSchema)
  async invoke(data: CorrectOperatorSubscriptionSnapshotData): Validated<OperatorUserDetailDto> {
    try {
      const result = await this.repo.correctSubscriptionSnapshotOrThrowUnscoped(data);
      return { ok: true, data: result };
    } catch (error) {
      const failure = operatorFailure(error);
      if (failure) return failure;
      throw error;
    }
  }
}
