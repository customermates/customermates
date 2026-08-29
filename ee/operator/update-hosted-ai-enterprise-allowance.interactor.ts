import type { OperatorRepo } from "./operator.repo";
import type { HostedAiOperatorCompanyDto } from "./operator.schema";

import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { UpdateHostedAiEnterpriseAllowanceSchema } from "./operator.schema";

@OperatorInteractor
export class UpdateHostedAiEnterpriseAllowanceInteractor {
  constructor(private readonly repo: OperatorRepo) {}

  async invoke(input: unknown): Promise<HostedAiOperatorCompanyDto> {
    const data = UpdateHostedAiEnterpriseAllowanceSchema.parse(input);
    return this.repo.updateEnterpriseAllowanceOrThrowUnscoped(data);
  }
}
