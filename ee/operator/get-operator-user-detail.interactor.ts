import type { OperatorRepo } from "./operator.repo";
import type { OperatorUserDetailDto } from "./operator.schema";

import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { GetOperatorUserDetailSchema } from "./operator.schema";

@OperatorInteractor
export class GetOperatorUserDetailInteractor {
  constructor(private readonly repo: OperatorRepo) {}

  async invoke(input: unknown): Promise<OperatorUserDetailDto> {
    const data = GetOperatorUserDetailSchema.parse(input);
    return this.repo.getUserDetailAuditedOrThrowUnscoped(data.userId);
  }
}
