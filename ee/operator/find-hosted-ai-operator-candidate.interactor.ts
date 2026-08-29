import type { OperatorRepo } from "./operator.repo";
import type { HostedAiOperatorCandidateDto } from "./operator.schema";

import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { FindHostedAiOperatorCandidateSchema } from "./operator.schema";

@OperatorInteractor
export class FindHostedAiOperatorCandidateInteractor {
  constructor(private readonly repo: OperatorRepo) {}

  async invoke(input: unknown): Promise<HostedAiOperatorCandidateDto | null> {
    const data = FindHostedAiOperatorCandidateSchema.parse(input);
    return this.repo.findCandidateAuditedUnscoped(data.email);
  }
}
