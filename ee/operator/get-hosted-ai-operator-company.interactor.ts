import type { OperatorRepo } from "./operator.repo";
import type { HostedAiOperatorCompanyDto } from "./operator.schema";

import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { GetHostedAiOperatorCompanySchema } from "./operator.schema";

@OperatorInteractor
export class GetHostedAiOperatorCompanyInteractor {
  constructor(private readonly repo: OperatorRepo) {}

  async invoke(input: unknown): Promise<HostedAiOperatorCompanyDto> {
    const data = GetHostedAiOperatorCompanySchema.parse(input);
    return this.repo.getCompanyAuditedOrThrowUnscoped(data.companyId);
  }
}
