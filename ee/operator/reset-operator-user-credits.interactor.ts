import type { OperatorRepo } from "./operator.repo";
import type { ResetOperatorUserCreditsResultDto } from "./operator.schema";

import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { ResetOperatorUserCreditsSchema } from "./operator.schema";

@OperatorInteractor
export class ResetOperatorUserCreditsInteractor {
  constructor(private readonly repo: OperatorRepo) {}

  async invoke(input: unknown): Promise<ResetOperatorUserCreditsResultDto> {
    const data = ResetOperatorUserCreditsSchema.parse(input);
    return this.repo.resetUserCreditsOrThrowUnscoped(data);
  }
}
