import type { OperatorRepo } from "./operator.repo";
import type { OperatorUserDetailDto } from "./operator.schema";

import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { CorrectOperatorSubscriptionSnapshotSchema } from "./operator.schema";

@OperatorInteractor
export class CorrectOperatorSubscriptionSnapshotInteractor {
  constructor(private readonly repo: OperatorRepo) {}

  async invoke(input: unknown): Promise<OperatorUserDetailDto> {
    const data = CorrectOperatorSubscriptionSnapshotSchema.parse(input);
    return this.repo.correctSubscriptionSnapshotOrThrowUnscoped(data);
  }
}
