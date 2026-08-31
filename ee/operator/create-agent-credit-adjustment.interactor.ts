import type { OperatorRepo } from "./operator.repo";
import type { CreateAgentCreditAdjustmentData, AgentCreditAdjustmentDto } from "./operator.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { operatorFailure } from "./operator.errors";
import { AgentCreditAdjustmentDtoSchema, CreateAgentCreditAdjustmentSchema } from "./operator.schema";

@OperatorInteractor
export class CreateAgentCreditAdjustmentInteractor {
  constructor(private readonly repo: OperatorRepo) {}

  @Enforce(CreateAgentCreditAdjustmentSchema)
  @ValidateOutput(AgentCreditAdjustmentDtoSchema)
  async invoke(data: CreateAgentCreditAdjustmentData): Validated<AgentCreditAdjustmentDto> {
    try {
      const result = await this.repo.createCreditAdjustmentOrThrowUnscoped(data);
      return { ok: true, data: result };
    } catch (error) {
      const failure = operatorFailure(error);
      if (failure) return failure;
      throw error;
    }
  }
}
