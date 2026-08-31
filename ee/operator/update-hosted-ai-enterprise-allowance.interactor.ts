import type { OperatorRepo } from "./operator.repo";
import type { UpdateHostedAiEnterpriseAllowanceData, HostedAiOperatorCompanyDto } from "./operator.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { operatorFailure } from "./operator.errors";
import { HostedAiOperatorCompanyDtoSchema, UpdateHostedAiEnterpriseAllowanceSchema } from "./operator.schema";

@OperatorInteractor
export class UpdateHostedAiEnterpriseAllowanceInteractor {
  constructor(private readonly repo: OperatorRepo) {}

  @Enforce(UpdateHostedAiEnterpriseAllowanceSchema)
  @ValidateOutput(HostedAiOperatorCompanyDtoSchema)
  async invoke(data: UpdateHostedAiEnterpriseAllowanceData): Validated<HostedAiOperatorCompanyDto> {
    try {
      const result = await this.repo.updateEnterpriseAllowanceOrThrowUnscoped(data);
      return { ok: true, data: result };
    } catch (error) {
      const failure = operatorFailure(error);
      if (failure) return failure;
      throw error;
    }
  }
}
