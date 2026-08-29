import type { OperatorRepo } from "./operator.repo";
import type { AgentCreditAdjustmentDto } from "./operator.schema";

import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { CreateAgentCreditAdjustmentSchema } from "./operator.schema";

@OperatorInteractor
export class CreateAgentCreditAdjustmentInteractor {
  constructor(private readonly repo: OperatorRepo) {}

  async invoke(input: unknown): Promise<AgentCreditAdjustmentDto> {
    const data = CreateAgentCreditAdjustmentSchema.parse(input);
    return this.repo.createCreditAdjustmentOrThrowUnscoped(data);
  }
}
