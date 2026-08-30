import type { OperatorRepo } from "./operator.repo";
import type { OperatorUserDetailDto } from "./operator.schema";

import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { UpdateOperatorUserPlatformAccessSchema } from "./operator.schema";

@OperatorInteractor
export class UpdateOperatorUserPlatformAccessInteractor {
  constructor(private readonly repo: OperatorRepo) {}

  async invoke(input: unknown): Promise<OperatorUserDetailDto> {
    const data = UpdateOperatorUserPlatformAccessSchema.parse(input);
    return this.repo.updateUserPlatformAccessOrThrowUnscoped(data);
  }
}
