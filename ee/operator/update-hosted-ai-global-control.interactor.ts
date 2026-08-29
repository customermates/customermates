import type { OperatorRepo } from "./operator.repo";
import type { HostedAiGlobalControlDto } from "./operator.schema";

import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { UpdateHostedAiGlobalControlSchema } from "./operator.schema";

@OperatorInteractor
export class UpdateHostedAiGlobalControlInteractor {
  constructor(private readonly repo: OperatorRepo) {}

  async invoke(input: unknown): Promise<HostedAiGlobalControlDto> {
    const data = UpdateHostedAiGlobalControlSchema.parse(input);
    return this.repo.updateGlobalControlUnscoped(data);
  }
}
